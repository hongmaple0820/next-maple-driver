import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { createId } from '@paralleldrive/cuid2';
import { getSession, deleteSession } from '@/lib/qr-sessions';

const ANON_MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const AUTH_MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const TRANSFER_STORAGE_PATH = join(process.cwd(), 'storage', 'transfers');

function generateToken(): string {
  return createId().slice(0, 8).toUpperCase();
}

// POST /api/transfer/qr-upload/[sessionId] - Upload file via QR session
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    // Validate QR session using shared module
    const session = getSession(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid or expired QR session' },
        { status: 400 }
      );
    }

    const userId = session.userId;
    const isAuth = !!userId;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const password = (formData.get('password') as string) || '';
    const expiresHours = parseInt(formData.get('expiresHours') as string) || '24';

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file size
    const maxSize = isAuth ? AUTH_MAX_FILE_SIZE : ANON_MAX_FILE_SIZE;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: `File exceeds ${isAuth ? '100MB' : '50MB'} size limit` },
        { status: 413 }
      );
    }

    // Validate expiry
    const maxExpiryDays = isAuth ? 30 : 7;
    let expiresAt: Date | null = null;
    if (expiresHours > 0) {
      expiresAt = new Date(Date.now() + expiresHours * 3600000);
      const maxExpiryMs = maxExpiryDays * 24 * 3600000;
      if (expiresAt.getTime() - Date.now() > maxExpiryMs) {
        expiresAt = new Date(Date.now() + maxExpiryMs);
      }
    } else {
      // Default 24h for QR uploads
      expiresAt = new Date(Date.now() + 24 * 3600000);
    }

    // Ensure transfer storage directory exists
    if (!existsSync(TRANSFER_STORAGE_PATH)) {
      await mkdir(TRANSFER_STORAGE_PATH, { recursive: true });
    }

    const token = generateToken();
    const fileId = crypto.randomUUID();
    const ext = file.name.includes('.') ? '.' + file.name.split('.').pop() : '';
    const storageName = `${fileId}${ext}`;
    const storagePath = join(TRANSFER_STORAGE_PATH, storageName);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(storagePath, buffer);

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
        maxDownloads: -1,
        userId,
        isAnonymous: !isAuth,
      },
    });

    // Consume the session after successful upload
    deleteSession(sessionId);

    return NextResponse.json({
      id: transferFile.id,
      token: transferFile.token,
      fileName: transferFile.fileName,
      fileSize: transferFile.fileSize,
      expiresAt: transferFile.expiresAt?.toISOString() || null,
      hasPassword: !!transferFile.password,
      shareUrl: `/transfer/${transferFile.token}`,
      createdAt: transferFile.createdAt.toISOString(),
    }, { status: 201 });
  } catch (error) {
    console.error('Error uploading via QR:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}
