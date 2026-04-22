import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, unauthorizedResponse } from '@/lib/auth-helpers';

// GET /api/files/path - Get path breadcrumb
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return unauthorizedResponse();
    }
    const userId = (user as Record<string, unknown>).id as string;
    const isAdmin = (user as Record<string, unknown>).role === 'admin';

    const { searchParams } = request.nextUrl;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'File ID is required' },
        { status: 400 }
      );
    }

    const path: Array<{ id: string; name: string }> = [];

    let currentId: string | null = id;

    while (currentId) {
      const file = await db.fileItem.findUnique({
        where: { id: currentId },
        select: { id: true, name: true, parentId: true, userId: true },
      });

      if (!file) {
        break;
      }

      // Verify ownership of each item in the path (unless admin)
      if (!isAdmin && file.userId !== userId) {
        break;
      }

      path.unshift({ id: file.id, name: file.name });
      currentId = file.parentId;
    }

    return NextResponse.json(path);
  } catch (error) {
    console.error('Error getting path:', error);
    return NextResponse.json(
      { error: 'Failed to get file path' },
      { status: 500 }
    );
  }
}
