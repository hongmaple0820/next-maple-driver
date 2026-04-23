import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth-helpers';

// GET /api/transfer/[token] - Get transfer file info (public, no auth needed)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const transferFile = await db.transferFile.findUnique({
      where: { token },
    });

    if (!transferFile) {
      return NextResponse.json(
        { error: 'Transfer not found' },
        { status: 404 }
      );
    }

    // Check if expired
    if (transferFile.expiresAt && transferFile.expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'This transfer has expired', expired: true },
        { status: 410 }
      );
    }

    // Check download limit
    if (transferFile.maxDownloads > 0 && transferFile.downloadCount >= transferFile.maxDownloads) {
      return NextResponse.json(
        { error: 'Download limit reached', limitReached: true },
        { status: 410 }
      );
    }

    return NextResponse.json({
      id: transferFile.id,
      token: transferFile.token,
      fileName: transferFile.fileName,
      fileSize: transferFile.fileSize,
      mimeType: transferFile.mimeType,
      hasPassword: !!transferFile.password,
      expiresAt: transferFile.expiresAt?.toISOString() || null,
      downloadCount: transferFile.downloadCount,
      maxDownloads: transferFile.maxDownloads,
      createdAt: transferFile.createdAt.toISOString(),
    });
  } catch (error) {
    console.error('Error getting transfer info:', error);
    return NextResponse.json(
      { error: 'Failed to get transfer info' },
      { status: 500 }
    );
  }
}

// DELETE /api/transfer/[token] - Delete a transfer file (requires auth, owner only)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    const userId = (user as Record<string, unknown>).id as string;

    const transferFile = await db.transferFile.findUnique({
      where: { token },
    });

    if (!transferFile) {
      return NextResponse.json(
        { error: 'Transfer not found' },
        { status: 404 }
      );
    }

    if (transferFile.userId !== userId) {
      return NextResponse.json(
        { error: 'Not authorized to delete this transfer' },
        { status: 403 }
      );
    }

    // Delete the file from storage
    try {
      const { unlink } = await import('fs/promises');
      const { join } = await import('path');
      const storagePath = join(process.cwd(), 'storage', 'transfers', transferFile.storagePath);
      await unlink(storagePath).catch(() => { /* ignore if file doesn't exist */ });
    } catch {
      // Ignore file system errors
    }

    await db.transferFile.delete({
      where: { id: transferFile.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting transfer:', error);
    return NextResponse.json(
      { error: 'Failed to delete transfer' },
      { status: 500 }
    );
  }
}
