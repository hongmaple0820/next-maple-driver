import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import archiver from 'archiver';
import { stat } from 'fs/promises';
import { join } from 'path';
import { Readable } from 'stream';

const STORAGE_PATH = join(process.cwd(), 'storage');

async function collectFiles(
  parentId: string | null,
  basePath: string
): Promise<{ path: string; storagePath: string }[]> {
  const items = await db.fileItem.findMany({
    where: { parentId, isTrashed: false },
    select: { id: true, name: true, type: true, storagePath: true, parentId: true },
  });

  const result: { path: string; storagePath: string }[] = [];

  for (const item of items) {
    if (item.type === 'folder') {
      const children = await collectFiles(item.id, join(basePath, item.name));
      result.push(...children);
    } else if (item.storagePath) {
      result.push({
        path: join(basePath, item.name),
        storagePath: item.storagePath,
      });
    }
  }

  return result;
}

// POST /api/files/download-zip - Download multiple files/folders as ZIP
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fileIds } = body as { fileIds: string[] };

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return NextResponse.json(
        { error: 'fileIds array is required and must not be empty' },
        { status: 400 }
      );
    }

    // Collect all files from the selected items (recursively for folders)
    const allFiles: { path: string; storagePath: string }[] = [];

    for (const fileId of fileIds) {
      const item = await db.fileItem.findUnique({
        where: { id: fileId },
        select: { id: true, name: true, type: true, storagePath: true, parentId: true, isTrashed: true },
      });

      if (!item || item.isTrashed) continue;

      if (item.type === 'folder') {
        const folderFiles = await collectFiles(item.id, item.name);
        allFiles.push(...folderFiles);
      } else if (item.storagePath) {
        allFiles.push({
          path: item.name,
          storagePath: item.storagePath,
        });
      }
    }

    if (allFiles.length === 0) {
      return NextResponse.json(
        { error: 'No files found to download' },
        { status: 404 }
      );
    }

    // Deduplicate files (in case same file is selected multiple ways)
    const seen = new Set<string>();
    const uniqueFiles = allFiles.filter((f) => {
      const key = f.storagePath;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Verify all files exist on disk
    for (const file of uniqueFiles) {
      const filePath = join(STORAGE_PATH, file.storagePath);
      try {
        await stat(filePath);
      } catch {
        // Skip files that don't exist on disk
        continue;
      }
    }

    // Create archiver zip stream
    const archive = archiver('zip', {
      zlib: { level: 6 }, // Balanced compression
    });

    // Add files to archive
    for (const file of uniqueFiles) {
      const filePath = join(STORAGE_PATH, file.storagePath);
      try {
        const fileStat = await stat(filePath);
        if (fileStat.isFile()) {
          archive.file(filePath, { name: file.path });
        }
      } catch {
        // Skip missing files
      }
    }

    // Finalize the archive
    archive.finalize();

    // Convert Node.js Readable to Web ReadableStream
    const nodeStream = archive as unknown as Readable;
    const webStream = new ReadableStream({
      start(controller) {
        nodeStream.on('data', (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk));
        });
        nodeStream.on('end', () => {
          controller.close();
        });
        nodeStream.on('error', (err: Error) => {
          controller.error(err);
        });
      },
    });

    // Return streaming response
    const headers = new Headers();
    headers.set('Content-Type', 'application/zip');
    headers.set(
      'Content-Disposition',
      'attachment; filename="cloudrive-download.zip"'
    );

    return new NextResponse(webStream, { headers });
  } catch (error) {
    console.error('Error creating ZIP download:', error);
    return NextResponse.json(
      { error: 'Failed to create ZIP download' },
      { status: 500 }
    );
  }
}
