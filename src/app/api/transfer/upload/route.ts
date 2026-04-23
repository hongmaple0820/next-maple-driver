import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { getAuthUser } from '@/lib/auth-helpers';
import { createId } from '@paralleldrive/cuid2';

const ANON_MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const AUTH_MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
const ANON_MAX_EXPIRY_DAYS = 7;
const AUTH_MAX_EXPIRY_DAYS = 30;
const ANON_TOTAL_STORAGE_LIMIT = 500 * 1024 * 1024; // 500MB total for anonymous
const AUTH_TOTAL_STORAGE_LIMIT = 5 * 1024 * 1024 * 1024; // 5GB total for authenticated
const TRANSFER_STORAGE_PATH = join(process.cwd(), 'storage', 'transfers');

function generateToken(): string {
  return createId().slice(0, 8).toUpperCase();
}

// POST /api/transfer/upload - Upload file to transfer service (supports anonymous)
export async function POST(request: NextRequest) {
  try {
    // Get auth user - returns null for anonymous, never throws
    let userId: string | null = null;
    try {
      const user = await getAuthUser();
      if (user) {
        userId = (user as Record<string, unknown>).id as string;
      }
    } catch {
      // Anonymous is ok
    }
    const isAuth = !!userId;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const password = (formData.get('password') as string) || '';
    const expiresHours = parseInt(formData.get('expiresHours') as string) || 0;
    const maxDownloads = parseInt(formData.get('maxDownloads') as string) || -1;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file size against per-file limit
    const maxSize = isAuth ? AUTH_MAX_FILE_SIZE : ANON_MAX_FILE_SIZE;
    if (file.size > maxSize) {
      return NextResponse.json(
        {
          error: `File exceeds ${isAuth ? '500MB' : '50MB'} size limit for ${isAuth ? 'authenticated' : 'anonymous'} users`,
          code: 'FILE_TOO_LARGE',
        },
        { status: 413 }
      );
    }

    // Check total storage capacity for the user
    const storageLimit = isAuth ? AUTH_TOTAL_STORAGE_LIMIT : ANON_TOTAL_STORAGE_LIMIT;
    const userTransfers = await db.transferFile.aggregate({
      _sum: { fileSize: true },
      where: isAuth
        ? { userId, expiresAt: { gte: new Date() } }
        : { isAnonymous: true, userId: null, expiresAt: { gte: new Date() } },
    });
    const usedStorage = userTransfers._sum.fileSize || 0;
    if (usedStorage + file.size > storageLimit) {
      return NextResponse.json(
        {
          error: `Storage limit exceeded. Used: ${Math.round(usedStorage / 1024 / 1024)}MB, Limit: ${Math.round(storageLimit / 1024 / 1024)}MB`,
          code: 'STORAGE_LIMIT_EXCEEDED',
          usedStorage,
          storageLimit,
        },
        { status: 507 }
      );
    }

    // Validate expiry
    const maxExpiryDays = isAuth ? AUTH_MAX_EXPIRY_DAYS : ANON_MAX_EXPIRY_DAYS;
    let expiresAt: Date | null = null;
    if (expiresHours > 0) {
      expiresAt = new Date(Date.now() + expiresHours * 3600000);
      const maxExpiryMs = maxExpiryDays * 24 * 3600000;
      if (expiresAt.getTime() - Date.now() > maxExpiryMs) {
        return NextResponse.json(
          {
            error: `Expiry cannot exceed ${maxExpiryDays} days for ${isAuth ? 'authenticated' : 'anonymous'} users`,
            code: 'EXPIRY_TOO_LONG',
          },
          { status: 400 }
        );
      }
    } else if (!isAuth) {
      // Anonymous users must set an expiry
      return NextResponse.json(
        {
          error: 'Anonymous uploads must have an expiry time',
          code: 'EXPIRY_REQUIRED',
        },
        { status: 400 }
      );
    }

    // Ensure transfer storage directory exists
    if (!existsSync(TRANSFER_STORAGE_PATH)) {
      await mkdir(TRANSFER_STORAGE_PATH, { recursive: true });
    }

    // Generate unique token and storage name
    const token = generateToken();
    const fileId = crypto.randomUUID();
    const ext = file.name.includes('.') ? '.' + file.name.split('.').pop() : '';
    const storageName = `${fileId}${ext}`;
    const storagePath = join(TRANSFER_STORAGE_PATH, storageName);

    // Write file to disk
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(storagePath, buffer);

    // Create database record
    const transferFile = await db.transferFile.create({
      data: {
        id: fileId,
        token,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || 'application/octet-stream',
        storagePath: storageName,
        password: password || null,
        expiresAt,
        maxDownloads,
        userId,
        isAnonymous: !isAuth,
      },
    });

    return NextResponse.json({
      id: transferFile.id,
      token: transferFile.token,
      fileName: transferFile.fileName,
      fileSize: transferFile.fileSize,
      expiresAt: transferFile.expiresAt?.toISOString() || null,
      hasPassword: !!transferFile.password,
      shareUrl: `/transfer/${transferFile.token}`,
      createdAt: transferFile.createdAt.toISOString(),
      isAnonymous: transferFile.isAnonymous,
    }, { status: 201 });
  } catch (error) {
    console.error('Error uploading transfer file:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}
