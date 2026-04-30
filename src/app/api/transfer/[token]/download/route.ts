import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readFile, stat } from 'fs/promises';
import { join } from 'path';

const TRANSFER_STORAGE_PATH = join(process.cwd(), 'storage', 'transfers');

// POST /api/transfer/[token]/download - Download the file (verifies password, increments count)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body = await request.json().catch(() => ({}));
    const { password } = body;

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

    // Check download limit BEFORE incrementing count
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

    // Verify password
    if (transferFile.password && transferFile.password !== password) {
      return NextResponse.json(
        { error: 'Incorrect password', code: 'INVALID_PASSWORD' },
        { status: 403 }
      );
    }

    // Verify the physical file still exists before incrementing the count
    const storagePath = join(TRANSFER_STORAGE_PATH, transferFile.storagePath);
    try {
      await stat(storagePath);
    } catch {
      // Physical file is missing - clean up the DB record
      await db.transferFile.delete({ where: { id: transferFile.id } }).catch(() => {});
      return NextResponse.json(
        { error: 'File no longer available', code: 'FILE_MISSING' },
        { status: 404 }
      );
    }

    // Increment download count atomically
    const updatedFile = await db.transferFile.update({
      where: { id: transferFile.id },
      data: { downloadCount: { increment: 1 } },
    });

    // Read and return the file
    const fileBuffer = await readFile(storagePath);

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': transferFile.mimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(transferFile.fileName)}`,
        'Content-Length': String(transferFile.fileSize),
        'X-Download-Count': String(updatedFile.downloadCount),
        'X-Max-Downloads': String(transferFile.maxDownloads),
      },
    });
  } catch (error) {
    console.error('Error downloading transfer file:', error);
    return NextResponse.json(
      { error: 'Failed to download file' },
      { status: 500 }
    );
  }
}
