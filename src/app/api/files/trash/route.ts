import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { getAuthUser, unauthorizedResponse } from '@/lib/auth-helpers';

const STORAGE_PATH = join(process.cwd(), 'storage');

// DELETE /api/files/trash - Empty trash (permanently delete all trashed items)
export async function DELETE() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return unauthorizedResponse();
    }
    const userId = (user as Record<string, unknown>).id as string;
    const isAdmin = (user as Record<string, unknown>).role === 'admin';

    // Get all trashed items for this user (admins get all)
    const userFilter = isAdmin ? {} : { userId };

    const trashedItems = await db.fileItem.findMany({
      where: { isTrashed: true, ...userFilter },
      select: { id: true },
    });

    // Delete each item recursively
    for (const item of trashedItems) {
      await deleteFileRecursively(item.id);
    }

    return NextResponse.json({
      message: `Permanently deleted ${trashedItems.length} items`,
      count: trashedItems.length,
    });
  } catch (error) {
    console.error('Error emptying trash:', error);
    return NextResponse.json(
      { error: 'Failed to empty trash' },
      { status: 500 }
    );
  }
}

async function deleteFileRecursively(id: string) {
  const children = await db.fileItem.findMany({
    where: { parentId: id },
    select: { id: true },
  });

  for (const child of children) {
    await deleteFileRecursively(child.id);
  }

  const file = await db.fileItem.findUnique({ where: { id } });

  if (file && file.type === 'file' && file.storagePath) {
    const filePath = join(STORAGE_PATH, file.storagePath);
    try {
      await unlink(filePath);
    } catch {
      // File might already be deleted
    }
  }

  await db.fileItem.delete({ where: { id } });
}
