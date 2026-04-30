import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { copyFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { createId } from '@paralleldrive/cuid2';
import { getAuthUser, unauthorizedResponse } from '@/lib/auth-helpers';

const STORAGE_PATH = join(process.cwd(), 'storage');

// POST /api/files/copy - Copy/duplicate a file or folder
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return unauthorizedResponse();
    }
    const userId = (user as Record<string, unknown>).id as string;
    const isAdmin = (user as Record<string, unknown>).role === 'admin';

    const body = await request.json();
    const { id, targetParentId } = body;

    if (!id) {
      return NextResponse.json({ error: 'File ID is required' }, { status: 400 });
    }

    const sourceFile = await db.fileItem.findUnique({ where: { id } });
    if (!sourceFile) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Verify ownership (unless admin)
    if (!isAdmin && sourceFile.userId !== userId) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const parentId = targetParentId === 'root' ? null : (targetParentId || sourceFile.parentId);

    // If target is not root, verify it exists and is a folder
    if (parentId !== null) {
      const targetFolder = await db.fileItem.findUnique({ where: { id: parentId } });
      if (!targetFolder || targetFolder.type !== 'folder') {
        return NextResponse.json({ error: 'Target must be a folder' }, { status: 400 });
      }
      // Verify target folder ownership (unless admin)
      if (!isAdmin && targetFolder.userId !== userId) {
        return NextResponse.json({ error: 'Target folder not found' }, { status: 404 });
      }
    }

    // Copy the file/folder recursively
    const copied = await copyItemRecursively(sourceFile, parentId, userId);

    return NextResponse.json(copied, { status: 201 });
  } catch (error) {
    console.error('Error copying file:', error);
    return NextResponse.json({ error: 'Failed to copy file' }, { status: 500 });
  }
}

async function copyItemRecursively(source: { id: string; name: string; type: string; size: number; mimeType: string | null; storagePath: string | null }, parentId: string | null, userId: string) {
  const newId = createId();

  // Generate a name that doesn't conflict
  let newName = source.name;
  if (source.type === 'file') {
    const existingCount = await db.fileItem.count({
      where: { parentId, name: { startsWith: source.name.replace(/(\.[^.]+)$/, '') }, isTrashed: false, userId },
    });
    if (existingCount > 0) {
      const ext = source.name.includes('.') ? '.' + source.name.split('.').pop() : '';
      const baseName = source.name.replace(new RegExp(`\\${ext}$`), '');
      newName = `${baseName} (copy${existingCount > 1 ? ` ${existingCount}` : ''})${ext}`;
    }
  } else {
    const existingCount = await db.fileItem.count({
      where: { parentId, name: { startsWith: source.name }, isTrashed: false, userId },
    });
    if (existingCount > 0) {
      newName = `${source.name} (copy${existingCount > 1 ? ` ${existingCount}` : ''})`;
    }
  }

  if (source.type === 'file' && source.storagePath) {
    // Copy the physical file
    const sourcePath = join(STORAGE_PATH, source.storagePath);
    const newStorageName = `${newId}_${newName}`;
    const destPath = join(STORAGE_PATH, newStorageName);

    await mkdir(STORAGE_PATH, { recursive: true });
    try {
      await copyFile(sourcePath, destPath);
    } catch {
      // Source file might not exist
    }

    const fileItem = await db.fileItem.create({
      data: {
        id: newId,
        name: newName,
        type: 'file',
        size: source.size,
        mimeType: source.mimeType ?? undefined,
        parentId,
        storagePath: newStorageName,
        userId,
      },
    });

    return {
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
    };
  } else {
    // It's a folder - create it and copy children
    const folder = await db.fileItem.create({
      data: {
        id: newId,
        name: newName,
        type: 'folder',
        parentId,
        userId,
      },
    });

    // Get and copy all children
    const children = await db.fileItem.findMany({
      where: { parentId: source.id, isTrashed: false },
    });

    for (const child of children) {
      await copyItemRecursively(child, newId, userId);
    }

    return {
      id: folder.id,
      name: folder.name,
      type: folder.type,
      size: folder.size,
      mimeType: folder.mimeType,
      parentId: folder.parentId ?? 'root',
      starred: folder.isStarred,
      trashed: folder.isTrashed,
      createdAt: folder.createdAt.toISOString(),
      updatedAt: folder.updatedAt.toISOString(),
    };
  }
}
