import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/share/[token] - Get share info for public page (does NOT increment download count)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

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
        { error: 'This link has expired', expired: true },
        { status: 410 }
      );
    }

    // Check if file is trashed
    if (shareLink.file.isTrashed) {
      return NextResponse.json(
        { error: 'This file has been deleted', deleted: true },
        { status: 404 }
      );
    }

    // Return share info + file info (without incrementing download count)
    return NextResponse.json({
      id: shareLink.id,
      token: shareLink.token,
      fileId: shareLink.fileId,
      hasPassword: !!shareLink.password,
      expiresAt: shareLink.expiresAt?.toISOString() || undefined,
      downloadCount: shareLink.downloadCount,
      createdAt: shareLink.createdAt.toISOString(),
      file: {
        id: shareLink.file.id,
        name: shareLink.file.name,
        type: shareLink.file.type,
        size: shareLink.file.size,
        mimeType: shareLink.file.mimeType,
        createdAt: shareLink.file.createdAt.toISOString(),
        updatedAt: shareLink.file.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error getting share info:', error);
    return NextResponse.json(
      { error: 'Failed to get share info' },
      { status: 500 }
    );
  }
}

// POST /api/share/[token] - Verify password for share access
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body = await request.json();
    const { password } = body;

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
        { error: 'This link has expired', expired: true },
        { status: 410 }
      );
    }

    // Check if file is trashed
    if (shareLink.file.isTrashed) {
      return NextResponse.json(
        { error: 'This file has been deleted', deleted: true },
        { status: 404 }
      );
    }

    // Verify password
    if (shareLink.password && shareLink.password !== password) {
      return NextResponse.json(
        { error: 'Incorrect password' },
        { status: 403 }
      );
    }

    // Increment download count on successful access
    await db.shareLink.update({
      where: { id: shareLink.id },
      data: { downloadCount: { increment: 1 } },
    });

    // Return share info + file info
    return NextResponse.json({
      id: shareLink.id,
      token: shareLink.token,
      fileId: shareLink.fileId,
      hasPassword: !!shareLink.password,
      expiresAt: shareLink.expiresAt?.toISOString() || undefined,
      downloadCount: shareLink.downloadCount + 1,
      createdAt: shareLink.createdAt.toISOString(),
      file: {
        id: shareLink.file.id,
        name: shareLink.file.name,
        type: shareLink.file.type,
        size: shareLink.file.size,
        mimeType: shareLink.file.mimeType,
        createdAt: shareLink.file.createdAt.toISOString(),
        updatedAt: shareLink.file.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error verifying share access:', error);
    return NextResponse.json(
      { error: 'Failed to verify share access' },
      { status: 500 }
    );
  }
}
