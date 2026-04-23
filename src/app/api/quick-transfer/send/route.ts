import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, unauthorizedResponse } from '@/lib/auth-helpers';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { createId } from '@paralleldrive/cuid2';

const STORAGE_PATH = join(process.cwd(), 'storage', 'uploads');

// POST /api/quick-transfer/send - Send files to a transfer code recipient
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return unauthorizedResponse();
    }
    const senderId = (user as Record<string, unknown>).id as string;

    const formData = await request.formData();
    const code = formData.get('code') as string;

    if (!code) {
      return NextResponse.json(
        { error: 'Transfer code is required' },
        { status: 400 }
      );
    }

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

    // Get files from form data
    const files: File[] = [];
    const folderPaths: string[] = [];

    // Collect all files
    let index = 0;
    while (true) {
      const file = formData.get(`file-${index}`) as File | null;
      if (!file) break;
      files.push(file);
      const folderPath = (formData.get(`folderPath-${index}`) as string) || '';
      folderPaths.push(folderPath);
      index++;
    }

    // Also check for a single file field (backward compat)
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

    // Ensure storage directory exists
    if (!existsSync(STORAGE_PATH)) {
      await mkdir(STORAGE_PATH, { recursive: true });
    }

    const targetUserId = session.userId;
    const targetParentId = session.folderId || null; // null = root

    const uploadedFiles: { id: string; name: string; size: number }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const folderPath = folderPaths[i];

      // Create folder structure if needed
      let currentParentId = targetParentId;

      if (folderPath) {
        const parts = folderPath.split('/').filter(Boolean);
        for (const part of parts) {
          // Check if folder exists
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

      // Check if file with same name exists and handle collision
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

      // Save file to disk
      const fileId = createId();
      const ext = fileName.includes('.') ? '.' + fileName.split('.').pop() : '';
      const storageName = `${fileId}${ext}`;
      const storagePath = join(STORAGE_PATH, storageName);

      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(storagePath, buffer);

      // Create file record in target user's directory
      await db.fileItem.create({
        data: {
          id: fileId,
          name: fileName,
          type: 'file',
          size: file.size,
          mimeType: file.type || 'application/octet-stream',
          parentId: currentParentId,
          storagePath,
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
    console.error('Error sending quick transfer files:', error);
    return NextResponse.json(
      { error: 'Failed to send files' },
      { status: 500 }
    );
  }
}
