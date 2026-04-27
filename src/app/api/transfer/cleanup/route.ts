import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { unlink } from 'fs/promises';
import { join } from 'path';

const TRANSFER_STORAGE_PATH = join(process.cwd(), 'storage', 'transfers');

// POST /api/transfer/cleanup - Clean up expired transfer files
// This endpoint can be called by a cron job to remove expired transfers
export async function POST() {
  try {
    const now = new Date();

    // Find all expired transfer files
    const expiredTransfers = await db.transferFile.findMany({
      where: {
        expiresAt: {
          lt: now,
        },
      },
    });

    if (expiredTransfers.length === 0) {
      return NextResponse.json({
        cleaned: 0,
        message: 'No expired transfers to clean up',
      });
    }

    let filesDeleted = 0;
    let filesFailed = 0;
    const deletedIds: string[] = [];

    // Delete physical files and database records
    for (const transfer of expiredTransfers) {
      try {
        const filePath = join(TRANSFER_STORAGE_PATH, transfer.storagePath);
        await unlink(filePath);
        filesDeleted++;
      } catch {
        // File may already be deleted or missing; still remove DB record
        filesFailed++;
      }

      // Always delete the database record even if file deletion failed
      try {
        await db.transferFile.delete({
          where: { id: transfer.id },
        });
        deletedIds.push(transfer.id);
      } catch (dbError) {
        console.error(`Failed to delete DB record for transfer ${transfer.id}:`, dbError);
      }
    }

    // Also clean up any orphaned TransferHistory records for expired transfers
    const orphanedHistory = await db.transferHistory.deleteMany({
      where: {
        status: 'active',
        expiresAt: { lt: now },
      },
    });

    return NextResponse.json({
      cleaned: deletedIds.length,
      filesDeleted,
      filesFailed,
      totalExpired: expiredTransfers.length,
      historyCleaned: orphanedHistory.count,
      cleanedIds,
    });
  } catch (error) {
    console.error('Error cleaning up expired transfers:', error);
    return NextResponse.json(
      { error: 'Failed to clean up expired transfers' },
      { status: 500 }
    );
  }
}

// GET /api/transfer/cleanup - Preview expired transfers without deleting them
export async function GET() {
  try {
    const now = new Date();

    const expiredTransfers = await db.transferFile.findMany({
      where: {
        expiresAt: {
          lt: now,
        },
      },
      select: {
        id: true,
        token: true,
        fileName: true,
        fileSize: true,
        expiresAt: true,
        isAnonymous: true,
        userId: true,
      },
    });

    const totalSize = expiredTransfers.reduce((sum, t) => sum + t.fileSize, 0);

    return NextResponse.json({
      count: expiredTransfers.length,
      totalSize,
      totalSizeMB: Math.round(totalSize / 1024 / 1024),
      transfers: expiredTransfers.map((t) => ({
        id: t.id,
        token: t.token,
        fileName: t.fileName,
        fileSize: t.fileSize,
        expiresAt: t.expiresAt?.toISOString() || null,
        isAnonymous: t.isAnonymous,
      })),
    });
  } catch (error) {
    console.error('Error previewing expired transfers:', error);
    return NextResponse.json(
      { error: 'Failed to preview expired transfers' },
      { status: 500 }
    );
  }
}
