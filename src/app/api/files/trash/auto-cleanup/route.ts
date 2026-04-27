import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { getAuthUser, unauthorizedResponse } from '@/lib/auth-helpers';

const STORAGE_PATH = join(process.cwd(), 'storage');

// DELETE /api/files/trash/auto-cleanup
// Permanently deletes files that have been in trash for more than 30 days.
export async function DELETE() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return unauthorizedResponse();
    }
    const userId = (user as Record<string, unknown>).id as string;
    const isAdmin = (user as Record<string, unknown>).role === 'admin';

    // Calculate the cutoff date (30 days ago)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);

    // Find trashed items older than 30 days
    const userFilter = isAdmin ? {} : { userId };

    const expiredItems = await db.fileItem.findMany({
      where: {
        isTrashed: true,
        updatedAt: { lte: cutoffDate },
        ...userFilter,
      },
      select: { id: true },
    });

    // Delete each item recursively (handles physical file cleanup too)
    for (const item of expiredItems) {
      await deleteFileRecursively(item.id);
    }

    return NextResponse.json({
      message: `Auto-cleanup: permanently deleted ${expiredItems.length} items that were in trash for more than 30 days`,
      count: expiredItems.length,
    });
  } catch (error) {
    console.error('Error during trash auto-cleanup:', error);
    return NextResponse.json(
      { error: 'Failed to perform trash auto-cleanup' },
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
