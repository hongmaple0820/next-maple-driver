import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, unauthorizedResponse } from '@/lib/auth-helpers';

// GET /api/files/recent - Get recently modified files
export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return unauthorizedResponse();
    }
    const userId = (user as Record<string, unknown>).id as string;
    const isAdmin = (user as Record<string, unknown>).role === 'admin';

    const userFilter = isAdmin ? {} : { userId };

    const files = await db.fileItem.findMany({
      where: {
        isTrashed: false,
        type: 'file',
        ...userFilter,
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      include: {
        _count: {
          select: { children: { where: { isTrashed: false } } },
        },
      },
    });

    const result = files.map((file) => ({
      id: file.id,
      name: file.name,
      type: file.type,
      size: file.size,
      mimeType: file.mimeType,
      parentId: file.parentId ?? 'root',
      starred: file.isStarred,
      trashed: file.isTrashed,
      createdAt: file.createdAt.toISOString(),
      updatedAt: file.updatedAt.toISOString(),
      childrenCount: file._count.children,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error getting recent files:', error);
    return NextResponse.json(
      { error: 'Failed to get recent files' },
      { status: 500 }
    );
  }
}
