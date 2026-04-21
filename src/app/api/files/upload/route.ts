import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { createId } from '@paralleldrive/cuid2';

const STORAGE_PATH = join(process.cwd(), 'storage');

// POST /api/files/upload - Upload files
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const parentIdParam = (formData.get('parentId') as string) || 'root';
    const parentId = parentIdParam === 'root' ? null : parentIdParam;

    // Get all files from form data
    const files: File[] = [];
    const filesEntry = formData.getAll('files');

    for (const entry of filesEntry) {
      if (entry instanceof File) {
        files.push(entry);
      }
    }

    if (files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      );
    }

    // Ensure storage directory exists
    await mkdir(STORAGE_PATH, { recursive: true });

    const createdFiles = [];

    for (const file of files) {
      const fileId = createId();
      const storageName = `${fileId}_${file.name}`;
      const storagePath = join(STORAGE_PATH, storageName);

      // Write file to local storage
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      await writeFile(storagePath, buffer);

      // Create database record
      const fileItem = await db.fileItem.create({
        data: {
          id: fileId,
          name: file.name,
          type: 'file',
          size: file.size,
          mimeType: file.type || 'application/octet-stream',
          parentId,
          storagePath: storageName,
        },
      });

      // Map to frontend-expected format
      createdFiles.push({
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

    return NextResponse.json(createdFiles, { status: 201 });
  } catch (error) {
    console.error('Error uploading files:', error);
    return NextResponse.json(
      { error: 'Failed to upload files' },
      { status: 500 }
    );
  }
}
