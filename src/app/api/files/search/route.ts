import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, unauthorizedResponse } from '@/lib/auth-helpers';

// GET /api/files/search - Search files
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return unauthorizedResponse();
    }
    const userId = (user as Record<string, unknown>).id as string;
    const isAdmin = (user as Record<string, unknown>).role === 'admin';

    const { searchParams } = request.nextUrl;
    const query = searchParams.get('q');

    if (!query || query.trim() === '') {
      return NextResponse.json(
        { error: 'Search query is required' },
        { status: 400 }
      );
    }

    const trimmedQuery = query.trim();

    const where: Record<string, unknown> = {
      name: {
        contains: trimmedQuery,
      },
      isTrashed: false,
    };

    if (!isAdmin) {
      where.userId = userId;
    }

    const files = await db.fileItem.findMany({
      where,
      include: {
        _count: {
          select: { children: { where: { isTrashed: false } } },
        },
      },
      take: 50,
      orderBy: [{ type: 'desc' }, { name: 'asc' }],
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
    console.error('Error searching files:', error);
    return NextResponse.json(
      { error: 'Failed to search files' },
      { status: 500 }
    );
  }
}
