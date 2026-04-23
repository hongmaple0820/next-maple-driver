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
        { error: 'Transfer not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // Check if expired
    if (transferFile.expiresAt && transferFile.expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'This transfer has expired', expired: true, code: 'EXPIRED' },
        { status: 410 }
      );
    }

    // Check download limit
    if (transferFile.maxDownloads > 0 && transferFile.downloadCount >= transferFile.maxDownloads) {
      return NextResponse.json(
        {
          error: 'Download limit reached',
          limitReached: true,
          code: 'DOWNLOAD_LIMIT_REACHED',
          downloadCount: transferFile.downloadCount,
          maxDownloads: transferFile.maxDownloads,
        },
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
      isAnonymous: transferFile.isAnonymous,
      remainingDownloads: transferFile.maxDownloads > 0
        ? Math.max(0, transferFile.maxDownloads - transferFile.downloadCount)
        : -1, // -1 means unlimited
    });
  } catch (error) {
    console.error('Error getting transfer info:', error);
    return NextResponse.json(
      { error: 'Failed to get transfer info' },
      { status: 500 }
    );
  }
}

// DELETE /api/transfer/[token] - Delete a transfer file (requires auth for owned files, or token-based for anonymous)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const user = await getAuthUser();
    const userId = user ? (user as Record<string, unknown>).id as string : null;

    const transferFile = await db.transferFile.findUnique({
      where: { token },
    });

    if (!transferFile) {
      return NextResponse.json(
        { error: 'Transfer not found' },
        { status: 404 }
      );
    }

    // Authorization: owner can delete, or anonymous transfer can be deleted by anyone with the token
    if (transferFile.userId && transferFile.userId !== userId) {
      return NextResponse.json(
        { error: 'Not authorized to delete this transfer' },
        { status: 403 }
      );
    }

    // For anonymous transfers without a userId, anyone with the token can delete
    // For authenticated transfers, only the owner can delete
    if (!transferFile.isAnonymous && !userId) {
      return NextResponse.json(
        { error: 'Authentication required to delete this transfer' },
        { status: 401 }
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

    return NextResponse.json({ success: true, deletedId: transferFile.id });
  } catch (error) {
    console.error('Error deleting transfer:', error);
    return NextResponse.json(
      { error: 'Failed to delete transfer' },
      { status: 500 }
    );
  }
}
