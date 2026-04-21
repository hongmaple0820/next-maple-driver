import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createId } from '@paralleldrive/cuid2';

// POST /api/files/share - Create share link
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fileId, password, expiresAt } = body;

    if (!fileId) {
      return NextResponse.json(
        { error: 'File ID is required' },
        { status: 400 }
      );
    }

    const file = await db.fileItem.findUnique({ where: { id: fileId } });
    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const token = createId();

    const shareLink = await db.shareLink.create({
      data: {
        fileId,
        token,
        password: password || null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });

    // Return in format expected by frontend ShareInfo type
    return NextResponse.json({
      id: shareLink.id,
      token: shareLink.token,
      fileId: shareLink.fileId,
      password: shareLink.password || undefined,
      expiresAt: shareLink.expiresAt?.toISOString() || undefined,
      downloadCount: shareLink.downloadCount,
      createdAt: shareLink.createdAt.toISOString(),
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating share link:', error);
    return NextResponse.json(
      { error: 'Failed to create share link' },
      { status: 500 }
    );
  }
}

// GET /api/files/share - Get share info
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { error: 'Share token is required' },
        { status: 400 }
      );
    }

    const shareLink = await db.shareLink.findUnique({
      where: { token },
      include: {
        file: true,
      },
    });

    if (!shareLink) {
      return NextResponse.json(
        { error: 'Share link not found' },
        { status: 404 }
      );
    }

    // Check if expired
    if (shareLink.expiresAt && shareLink.expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'Share link has expired' },
        { status: 410 }
      );
    }

    // Increment download count
    await db.shareLink.update({
      where: { id: shareLink.id },
      data: { downloadCount: { increment: 1 } },
    });

    return NextResponse.json({
      id: shareLink.id,
      token: shareLink.token,
      fileId: shareLink.fileId,
      password: shareLink.password || undefined,
      expiresAt: shareLink.expiresAt?.toISOString() || undefined,
      downloadCount: shareLink.downloadCount + 1,
      createdAt: shareLink.createdAt.toISOString(),
    });
  } catch (error) {
    console.error('Error getting share info:', error);
    return NextResponse.json(
      { error: 'Failed to get share info' },
      { status: 500 }
    );
  }
}
