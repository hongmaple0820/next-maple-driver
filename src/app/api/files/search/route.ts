import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/files/search - Search files
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const query = searchParams.get('q');

    if (!query || query.trim() === '') {
      return NextResponse.json(
        { error: 'Search query is required' },
        { status: 400 }
      );
    }

    const trimmedQuery = query.trim();

    const files = await db.fileItem.findMany({
      where: {
        name: {
          contains: trimmedQuery,
        },
        isTrashed: false,
      },
      include: {
        _count: {
          select: { children: true },
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
      parentId: file.parentId,
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
