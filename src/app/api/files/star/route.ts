import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, unauthorizedResponse } from '@/lib/auth-helpers';

// POST /api/files/star - Star/unstar file
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return unauthorizedResponse();
    }
    const userId = (user as Record<string, unknown>).id as string;
    const isAdmin = (user as Record<string, unknown>).role === 'admin';

    const body = await request.json();
    const { id, starred } = body;

    if (!id || typeof starred !== 'boolean') {
      return NextResponse.json(
        { error: 'File ID and starred boolean are required' },
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

    const updated = await db.fileItem.update({
      where: { id },
      data: { isStarred: starred },
    });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      type: updated.type,
      size: updated.size,
      mimeType: updated.mimeType,
      parentId: updated.parentId ?? 'root',
      starred: updated.isStarred,
      trashed: updated.isTrashed,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('Error starring file:', error);
    return NextResponse.json(
      { error: 'Failed to update star status' },
      { status: 500 }
    );
  }
}
