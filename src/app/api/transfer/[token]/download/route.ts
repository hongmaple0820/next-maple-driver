import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readFile } from 'fs/promises';
import { join } from 'path';

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

    // Verify password
    if (transferFile.password && transferFile.password !== password) {
      return NextResponse.json(
        { error: 'Incorrect password' },
        { status: 403 }
      );
    }

    // Increment download count
    await db.transferFile.update({
      where: { id: transferFile.id },
      data: { downloadCount: { increment: 1 } },
    });

    // Read and return the file
    const storagePath = join(process.cwd(), 'storage', 'transfers', transferFile.storagePath);
    const fileBuffer = await readFile(storagePath);

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': transferFile.mimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(transferFile.fileName)}`,
        'Content-Length': String(transferFile.fileSize),
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
