import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/quick-transfer/[code]/files - Get files received via this transfer code
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;

    const session = await db.quickTransferSession.findUnique({
      where: { code: code.toUpperCase() },
    });

    if (!session) {
      return NextResponse.json(
        { error: 'Transfer code not found' },
        { status: 404 }
      );
    }

    // Get files that were created in the target folder after the session was created
    // These are files that were sent to this session's owner
    const targetParentId = session.folderId || null;

    const files = await db.fileItem.findMany({
      where: {
        parentId: targetParentId,
        isTrashed: false,
        createdAt: { gte: session.createdAt },
        type: 'file',
        userId: session.userId,
      },
      select: {
        id: true,
        name: true,
        size: true,
        mimeType: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json(
      files.map((f) => ({
        id: f.id,
        name: f.name,
        size: f.size,
        mimeType: f.mimeType,
        createdAt: f.createdAt.toISOString(),
      }))
    );
  } catch (error) {
    console.error('Error getting received files:', error);
    return NextResponse.json(
      { error: 'Failed to get received files' },
      { status: 500 }
    );
  }
}
