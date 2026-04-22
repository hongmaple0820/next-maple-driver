import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, unauthorizedResponse } from '@/lib/auth-helpers';

// POST /api/files/restore - Restore from trash
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return unauthorizedResponse();
    }
    const userId = (user as Record<string, unknown>).id as string;
    const isAdmin = (user as Record<string, unknown>).role === 'admin';

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'File ID is required' },
        { status: 400 }
      );
    }

    const file = await db.fileItem.findUnique({ where: { id } });
    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Verify ownership (unless admin)
    if (!isAdmin && file.userId !== userId) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    if (!file.isTrashed) {
      return NextResponse.json(
        { error: 'File is not in trash' },
        { status: 400 }
      );
    }

    // Restore the item and all its children recursively
    await restoreFileRecursively(id);

    const updated = await db.fileItem.findUnique({ where: { id } });

    return NextResponse.json({
      id: updated!.id,
      name: updated!.name,
      type: updated!.type,
      size: updated!.size,
      mimeType: updated!.mimeType,
      parentId: updated!.parentId ?? 'root',
      starred: updated!.isStarred,
      trashed: updated!.isTrashed,
      createdAt: updated!.createdAt.toISOString(),
      updatedAt: updated!.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('Error restoring file:', error);
    return NextResponse.json(
      { error: 'Failed to restore file' },
      { status: 500 }
    );
  }
}

async function restoreFileRecursively(id: string) {
  // Get all children
  const children = await db.fileItem.findMany({
    where: { parentId: id },
    select: { id: true },
  });

  // Recursively restore children
  for (const child of children) {
    await restoreFileRecursively(child.id);
  }

  // Restore the item itself
  await db.fileItem.update({
    where: { id },
    data: { isTrashed: false },
  });
}
