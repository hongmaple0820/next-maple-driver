import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { getAuthUser, unauthorizedResponse } from '@/lib/auth-helpers';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return unauthorizedResponse();
    }
    const userId = (user as Record<string, unknown>).id as string;

    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const parentIdParam = (formData.get('parentId') as string) || 'root';
    const parentId = parentIdParam === 'root' ? null : parentIdParam;

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      );
    }

    // Ensure storage directory exists
    const STORAGE_PATH = join(process.cwd(), 'storage');
    if (!existsSync(STORAGE_PATH)) {
      await mkdir(STORAGE_PATH, { recursive: true });
    }

    const results = [];

    for (const file of files) {
      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File "${file.name}" exceeds 100MB size limit` },
          { status: 413 }
        );
      }

      // Generate unique storage name
      const fileId = crypto.randomUUID();
      const ext = file.name.includes('.') ? '.' + file.name.split('.').pop() : '';
      const storageName = `${fileId}${ext}`;
      const storagePath = join(STORAGE_PATH, storageName);

      // Write file to disk
      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(storagePath, buffer);

      // Check for duplicate name in same parent
      const existing = await db.fileItem.findFirst({
        where: {
          parentId,
          name: file.name,
          isTrashed: false,
          userId,
        },
      });

      let fileName = file.name;
      if (existing) {
        // Append number suffix for duplicate names
        const nameWithoutExt = file.name.includes('.')
          ? file.name.substring(0, file.name.lastIndexOf('.'))
          : file.name;
        const extension = file.name.includes('.')
          ? file.name.substring(file.name.lastIndexOf('.'))
          : '';
        let counter = 1;
        while (true) {
          const candidateName = `${nameWithoutExt} (${counter})${extension}`;
          const dupCheck = await db.fileItem.findFirst({
            where: { parentId, name: candidateName, isTrashed: false, userId },
          });
          if (!dupCheck) {
            fileName = candidateName;
            break;
          }
          counter++;
        }
      }

      // Create database record
      const fileItem = await db.fileItem.create({
        data: {
          id: fileId,
          name: fileName,
          type: 'file',
          size: file.size,
          mimeType: file.type || 'application/octet-stream',
          parentId,
          storagePath: storageName,
          userId,
        },
      });

      results.push({
        id: fileItem.id,
        name: fileItem.name,
        type: fileItem.type,
        size: fileItem.size,
        mimeType: fileItem.mimeType,
        parentId: fileItem.parentId ?? 'root',
        starred: fileItem.isStarred,
        trashed: fileItem.isTrashed,
        createdAt: fileItem.createdAt.toISOString(),
        updatedAt: fileItem.updatedAt.toISOString(),
      });
    }

    return NextResponse.json(
      files.length === 1 ? results[0] : results,
      { status: 201 }
    );
  } catch (error) {
    console.error('Error uploading files:', error);
    return NextResponse.json(
      { error: 'Failed to upload files' },
      { status: 500 }
    );
  }
}
