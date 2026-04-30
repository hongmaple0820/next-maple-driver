import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readFile, stat, open } from 'fs/promises';
import { join } from 'path';
import { getAuthUser, unauthorizedResponse } from '@/lib/auth-helpers';

const STORAGE_PATH = join(process.cwd(), 'storage');

// GET /api/files/download - Download file with range request support
// Supports auth-based access and share-token-based access (for public share links)
// Supports Range headers for resumable downloads
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const id = searchParams.get('id');
    const mode = searchParams.get('mode'); // 'inline' for preview, 'attachment' for download
    const shareToken = searchParams.get('shareToken'); // for public share access

    if (!id) {
      return NextResponse.json(
        { error: 'File ID is required' },
        { status: 400 }
      );
    }

    const file = await db.fileItem.findUnique({ where: { id } });

    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Check authorization: either authenticated user owns the file (or is admin), or valid share token
    let authorized = false;

    if (shareToken) {
      // Public share access - verify the share token
      const shareLink = await db.shareLink.findUnique({
        where: { token: shareToken },
      });
      if (shareLink && shareLink.fileId === id) {
        // Check if expired
        if (shareLink.expiresAt && shareLink.expiresAt < new Date()) {
          return NextResponse.json(
            { error: 'Share link has expired' },
            { status: 410 }
          );
        }
        // Check if file is trashed
        if (file.isTrashed) {
          return NextResponse.json(
            { error: 'File has been deleted' },
            { status: 404 }
          );
        }
        authorized = true;
      }
    }

    if (!authorized) {
      // Check auth
      const user = await getAuthUser();
      if (!user) {
        return unauthorizedResponse();
      }
      const userId = (user as Record<string, unknown>).id as string;
      const isAdmin = (user as Record<string, unknown>).role === 'admin';

      if (!isAdmin && file.userId !== userId) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
      }
      authorized = true;
    }

    if (file.type === 'folder') {
      return NextResponse.json(
        { error: 'Cannot download a folder' },
        { status: 400 }
      );
    }

    if (!file.storagePath) {
      return NextResponse.json(
        { error: 'File has no storage path' },
        { status: 404 }
      );
    }

    const filePath = join(STORAGE_PATH, file.storagePath);

    // Check if file exists
    let fileStat;
    try {
      fileStat = await stat(filePath);
    } catch {
      return NextResponse.json(
        { error: 'File not found on disk' },
        { status: 404 }
      );
    }

    const fileSize = fileStat.size;

    // Parse Range header for resumable downloads
    const rangeHeader = request.headers.get('range');

    if (rangeHeader) {
      // Parse range: "bytes=start-end"
      const rangeMatch = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (!rangeMatch) {
        return NextResponse.json(
          { error: 'Invalid Range header' },
          { status: 416 }
        );
      }

      const start = parseInt(rangeMatch[1], 10);
      const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : fileSize - 1;

      // Validate range
      if (start >= fileSize || end >= fileSize || start > end) {
        return new NextResponse(null, {
          status: 416,
          headers: {
            'Content-Range': `bytes */${fileSize}`,
          },
        });
      }

      const contentLength = end - start + 1;

      // Read only the requested range
      const fileHandle = await open(filePath, 'r');
      const buffer = Buffer.alloc(contentLength);
      await fileHandle.read(buffer, 0, contentLength, start);
      await fileHandle.close();

      const headers = new Headers();
      const disposition = mode === 'inline' ? 'inline' : 'attachment';
      headers.set('Content-Disposition', `${disposition}; filename="${encodeURIComponent(file.name)}"`);
      headers.set('Content-Type', file.mimeType || 'application/octet-stream');
      headers.set('Content-Length', contentLength.toString());
      headers.set('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      headers.set('Accept-Ranges', 'bytes');

      if (mode === 'inline') {
        headers.set('Access-Control-Allow-Origin', '*');
      }

      return new NextResponse(buffer, {
        status: 206,
        headers,
      });
    }

    // No Range header — return full file
    const fileBuffer = await readFile(filePath);

    const headers = new Headers();
    const disposition = mode === 'inline' ? 'inline' : 'attachment';
    headers.set('Content-Disposition', `${disposition}; filename="${encodeURIComponent(file.name)}"`);
    headers.set('Content-Type', file.mimeType || 'application/octet-stream');
    headers.set('Content-Length', fileSize.toString());
    headers.set('Accept-Ranges', 'bytes');

    // Allow CORS for inline previews
    if (mode === 'inline') {
      headers.set('Access-Control-Allow-Origin', '*');
    }

    return new NextResponse(fileBuffer, { headers });
  } catch (error) {
    console.error('Error downloading file:', error);
    return NextResponse.json(
      { error: 'Failed to download file' },
      { status: 500 }
    );
  }
}
