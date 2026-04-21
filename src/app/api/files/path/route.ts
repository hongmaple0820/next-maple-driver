import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/files/path - Get path breadcrumb
export async function GET(request: NextRequest) {
  try {
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
        select: { id: true, name: true, parentId: true },
      });

      if (!file) {
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
