import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth-helpers';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { createId } from '@paralleldrive/cuid2';

const STORAGE_PATH = join(process.cwd(), 'storage');

// GET /api/quick-transfer/[code] - Get info about a transfer code
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const session = await db.quickTransferSession.findUnique({
      where: { code: code.toUpperCase() },
      include: { user: { select: { name: true } } },
    });

    if (!session) {
      return NextResponse.json(
        { error: 'Transfer code not found' },
        { status: 404 }
      );
    }

    // Check if expired
    if (session.expiresAt < new Date() || !session.isActive) {
      if (session.isActive) {
        await db.quickTransferSession.update({
          where: { id: session.id },
          data: { isActive: false },
        });
      }
      return NextResponse.json({
        code: session.code,
        isActive: false,
        isExpired: true,
        recipientName: session.user.name,
      });
    }

    return NextResponse.json({
      code: session.code,
      isActive: session.isActive,
      isExpired: false,
      recipientName: session.user.name,
      expiresAt: session.expiresAt.toISOString(),
    });
  } catch (error) {
    console.error('Error getting quick transfer code info:', error);
    return NextResponse.json(
      { error: 'Failed to get transfer code info' },
      { status: 500 }
    );
  }
}

const ANON_MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB for anonymous
const AUTH_MAX_TOTAL_SIZE = 500 * 1024 * 1024; // 500MB for authenticated

// POST /api/quick-transfer/[code] - Send files to this code's owner (supports anonymous)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const user = await getAuthUser();
    const senderId = user ? (user as Record<string, unknown>).id as string : null;
    const isAuth = !!senderId;

    const { code } = await params;

    // Look up the session by code
    const session = await db.quickTransferSession.findUnique({
      where: { code: code.toUpperCase() },
    });

    if (!session || !session.isActive) {
      return NextResponse.json(
        { error: 'Invalid or expired transfer code' },
        { status: 404 }
      );
    }

    if (session.expiresAt < new Date()) {
      await db.quickTransferSession.update({
        where: { id: session.id },
        data: { isActive: false },
      });
      return NextResponse.json(
        { error: 'Transfer code has expired' },
        { status: 410 }
      );
    }

    // Don't allow sending to yourself
    if (senderId && session.userId === senderId) {
      return NextResponse.json(
        { error: 'Cannot send files to yourself' },
        { status: 400 }
      );
    }

    const formData = await request.formData();

    // Get files from form data
    const files: File[] = [];
    const folderPaths: string[] = [];

    let index = 0;
    while (true) {
      const file = formData.get(`file-${index}`) as File | null;
      if (!file) break;
      files.push(file);
      const folderPath = (formData.get(`folderPath-${index}`) as string) || '';
      folderPaths.push(folderPath);
      index++;
    }

    const singleFile = formData.get('file') as File | null;
    if (files.length === 0 && singleFile) {
      files.push(singleFile);
      folderPaths.push('');
    }

    if (files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      );
    }

    // Validate total file size based on auth status
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    const maxTotalSize = isAuth ? AUTH_MAX_TOTAL_SIZE : ANON_MAX_TOTAL_SIZE;
    if (totalSize > maxTotalSize) {
      return NextResponse.json(
        { error: `Total file size exceeds ${isAuth ? '500MB' : '50MB'} limit for ${isAuth ? 'authenticated' : 'anonymous'} users` },
        { status: 413 }
      );
    }

    // Ensure storage directory exists
    if (!existsSync(STORAGE_PATH)) {
      await mkdir(STORAGE_PATH, { recursive: true });
    }

    const targetUserId = session.userId;
    const targetParentId = session.folderId || null;

    const uploadedFiles: { id: string; name: string; size: number }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const folderPath = folderPaths[i];

      let currentParentId = targetParentId;

      if (folderPath) {
        const parts = folderPath.split('/').filter(Boolean);
        for (const part of parts) {
          const existing = await db.fileItem.findFirst({
            where: {
              name: part,
              parentId: currentParentId,
              type: 'folder',
              isTrashed: false,
              userId: targetUserId,
            },
          });

          if (existing) {
            currentParentId = existing.id;
          } else {
            const folderId = createId();
            await db.fileItem.create({
              data: {
                id: folderId,
                name: part,
                type: 'folder',
                parentId: currentParentId,
                userId: targetUserId,
              },
            });
            currentParentId = folderId;
          }
        }
      }

      // Handle name collision
      let fileName = file.name;
      let nameCounter = 1;
      while (true) {
        const existingFile = await db.fileItem.findFirst({
          where: {
            name: fileName,
            parentId: currentParentId,
            isTrashed: false,
            userId: targetUserId,
          },
        });
        if (!existingFile) break;
        const dotIndex = file.name.lastIndexOf('.');
        if (dotIndex > 0) {
          fileName = `${file.name.slice(0, dotIndex)} (${nameCounter})${file.name.slice(dotIndex)}`;
        } else {
          fileName = `${file.name} (${nameCounter})`;
        }
        nameCounter++;
      }

      const fileId = createId();
      const ext = fileName.includes('.') ? '.' + fileName.split('.').pop() : '';
      const storageName = `${fileId}${ext}`;
      const filePath = join(STORAGE_PATH, storageName);

      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(filePath, buffer);

      await db.fileItem.create({
        data: {
          id: fileId,
          name: fileName,
          type: 'file',
          size: file.size,
          mimeType: file.type || 'application/octet-stream',
          parentId: currentParentId,
          storagePath: storageName,
          userId: targetUserId,
        },
      });

      uploadedFiles.push({ id: fileId, name: fileName, size: file.size });
    }

    return NextResponse.json({
      success: true,
      fileCount: uploadedFiles.length,
      files: uploadedFiles,
      recipientCode: session.code,
    }, { status: 201 });
  } catch (error) {
    console.error('Error sending files to transfer code:', error);
    return NextResponse.json(
      { error: 'Failed to send files' },
      { status: 500 }
    );
  }
}
