import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { writeFile, mkdir, readFile, stat, readdir, unlink, rmdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { getAuthUser, unauthorizedResponse } from '@/lib/auth-helpers';

const CHUNK_UPLOAD_DIR = '/tmp/clouddrive-uploads';
const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB for chunked uploads

// POST /api/files/upload/chunked — Initialize a chunked upload session
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return unauthorizedResponse();
    }
    const userId = (user as Record<string, unknown>).id as string;

    const body = await request.json();
    const { fileName, fileSize, parentId, driverId, chunkSize } = body as {
      fileName: string;
      fileSize: number;
      parentId?: string;
      driverId?: string;
      chunkSize?: number;
    };

    if (!fileName || !fileSize) {
      return NextResponse.json(
        { error: 'fileName and fileSize are required' },
        { status: 400 }
      );
    }

    if (fileSize > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit` },
        { status: 413 }
      );
    }

    const effectiveChunkSize = chunkSize && chunkSize > 0 ? chunkSize : DEFAULT_CHUNK_SIZE;
    const totalChunks = Math.ceil(fileSize / effectiveChunkSize);
    const uploadId = crypto.randomUUID();

    // Create temp directory for this upload
    const uploadDir = join(CHUNK_UPLOAD_DIR, uploadId);
    await mkdir(uploadDir, { recursive: true });

    // Write metadata file
    const metadata = {
      uploadId,
      fileName,
      fileSize,
      parentId: parentId || 'root',
      driverId: driverId || null,
      userId,
      chunkSize: effectiveChunkSize,
      totalChunks,
      createdAt: new Date().toISOString(),
    };
    await writeFile(join(uploadDir, '_metadata.json'), JSON.stringify(metadata, null, 2));

    // Create task record in database
    const taskRecord = await db.taskRecord.create({
      data: {
        userId,
        type: 'upload',
        status: 'pending',
        progress: 0,
        fileName,
        fileSize,
        totalSize: fileSize,
        totalChunks,
        uploadId,
        metadata: JSON.stringify({ parentId: parentId || 'root', driverId: driverId || null, chunkSize: effectiveChunkSize }),
      },
    });

    return NextResponse.json({
      uploadId,
      chunkSize: effectiveChunkSize,
      totalChunks,
      taskId: taskRecord.id,
    }, { status: 201 });
  } catch (error) {
    console.error('Error initializing chunked upload:', error);
    return NextResponse.json(
      { error: 'Failed to initialize chunked upload' },
      { status: 500 }
    );
  }
}

// PUT /api/files/upload/chunked — Upload a chunk
export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return unauthorizedResponse();
    }

    const formData = await request.formData();
    const uploadId = formData.get('uploadId') as string;
    const chunkIndex = parseInt(formData.get('chunkIndex') as string, 10);
    const chunkData = formData.get('chunk') as File;

    if (!uploadId || isNaN(chunkIndex) || !chunkData) {
      return NextResponse.json(
        { error: 'uploadId, chunkIndex, and chunk data are required' },
        { status: 400 }
      );
    }

    const uploadDir = join(CHUNK_UPLOAD_DIR, uploadId);
    if (!existsSync(uploadDir)) {
      return NextResponse.json(
        { error: 'Upload session not found. It may have expired.' },
        { status: 404 }
      );
    }

    // Read metadata
    const metadataRaw = await readFile(join(uploadDir, '_metadata.json'), 'utf-8');
    const metadata = JSON.parse(metadataRaw);

    // Validate chunk index
    if (chunkIndex < 0 || chunkIndex >= metadata.totalChunks) {
      return NextResponse.json(
        { error: `Invalid chunk index. Must be 0-${metadata.totalChunks - 1}` },
        { status: 400 }
      );
    }

    // Write chunk to disk
    const chunkPath = join(uploadDir, `chunk_${chunkIndex}`);
    const buffer = Buffer.from(await chunkData.arrayBuffer());
    await writeFile(chunkPath, buffer);

    // Check how many chunks are uploaded
    const files = await readdir(uploadDir);
    const uploadedChunks = files
      .filter((f) => f.startsWith('chunk_'))
      .map((f) => parseInt(f.replace('chunk_', ''), 10))
      .filter((n) => !isNaN(n));

    const progress = Math.round((uploadedChunks.length / metadata.totalChunks) * 100);

    // Update task record
    await db.taskRecord.updateMany({
      where: { uploadId },
      data: {
        status: 'running',
        progress,
        chunkIndex: chunkIndex,
        startedAt: new Date(),
      },
    });

    return NextResponse.json({
      uploadId,
      chunkIndex,
      received: true,
      uploadedChunks,
      totalChunks: metadata.totalChunks,
      progress,
    });
  } catch (error) {
    console.error('Error uploading chunk:', error);
    return NextResponse.json(
      { error: 'Failed to upload chunk' },
      { status: 500 }
    );
  }
}

// PATCH /api/files/upload/chunked — Complete the upload (merge all chunks)
export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return unauthorizedResponse();
    }
    const userId = (user as Record<string, unknown>).id as string;

    const body = await request.json();
    const { uploadId } = body as { uploadId: string };

    if (!uploadId) {
      return NextResponse.json(
        { error: 'uploadId is required' },
        { status: 400 }
      );
    }

    const uploadDir = join(CHUNK_UPLOAD_DIR, uploadId);
    if (!existsSync(uploadDir)) {
      return NextResponse.json(
        { error: 'Upload session not found' },
        { status: 404 }
      );
    }

    // Read metadata
    const metadataRaw = await readFile(join(uploadDir, '_metadata.json'), 'utf-8');
    const metadata = JSON.parse(metadataRaw);

    // Verify all chunks are present
    const files = await readdir(uploadDir);
    const uploadedChunks = files
      .filter((f) => f.startsWith('chunk_'))
      .map((f) => parseInt(f.replace('chunk_', ''), 10))
      .sort((a, b) => a - b);

    if (uploadedChunks.length < metadata.totalChunks) {
      const missingChunks = [];
      for (let i = 0; i < metadata.totalChunks; i++) {
        if (!uploadedChunks.includes(i)) {
          missingChunks.push(i);
        }
      }
      return NextResponse.json(
        { error: 'Not all chunks are uploaded', missingChunks, totalChunks: metadata.totalChunks, uploadedCount: uploadedChunks.length },
        { status: 400 }
      );
    }

    // Merge chunks into final file
    const STORAGE_PATH = join(process.cwd(), 'storage');
    if (!existsSync(STORAGE_PATH)) {
      await mkdir(STORAGE_PATH, { recursive: true });
    }

    const fileId = crypto.randomUUID();
    const ext = metadata.fileName.includes('.') ? '.' + metadata.fileName.split('.').pop() : '';
    const storageName = `${fileId}${ext}`;
    const finalPath = join(STORAGE_PATH, storageName);

    // Merge: read each chunk and append to final file
    const { createWriteStream } = await import('fs');
    const writeStream = createWriteStream(finalPath);

    for (const chunkIdx of uploadedChunks) {
      const chunkPath = join(uploadDir, `chunk_${chunkIdx}`);
      const chunkBuffer = await readFile(chunkPath);
      writeStream.write(chunkBuffer);
    }

    // Wait for write to complete
    await new Promise<void>((resolve, reject) => {
      writeStream.end(() => resolve());
      writeStream.on('error', reject);
    });

    // Verify merged file size
    const finalStat = await stat(finalPath);
    const parentId = metadata.parentId === 'root' ? null : metadata.parentId;

    // Check for duplicate name
    const existing = await db.fileItem.findFirst({
      where: {
        parentId,
        name: metadata.fileName,
        isTrashed: false,
        userId,
      },
    });

    let fileName = metadata.fileName;
    if (existing) {
      const nameWithoutExt = metadata.fileName.includes('.')
        ? metadata.fileName.substring(0, metadata.fileName.lastIndexOf('.'))
        : metadata.fileName;
      const extension = metadata.fileName.includes('.')
        ? metadata.fileName.substring(metadata.fileName.lastIndexOf('.'))
        : '';
      let counter = 1;
      while (true) {
        const candidateName = `${nameWithoutExt} (${counter})${extension}`;
        const dupCheck = await db.fileItem.findFirst({
          where: { parentId, name: candidateName, isTrashed: false, userId },
        });
        if (!dupCheck) {
          fileName = candidateName;
          break;
        }
        counter++;
      }
    }

    // Create database record
    const fileItem = await db.fileItem.create({
      data: {
        id: fileId,
        name: fileName,
        type: 'file',
        size: finalStat.size,
        mimeType: 'application/octet-stream',
        parentId,
        storagePath: storageName,
        userId,
        driverId: metadata.driverId,
      },
    });

    // Update task record
    await db.taskRecord.updateMany({
      where: { uploadId },
      data: {
        status: 'completed',
        progress: 100,
        completedAt: new Date(),
      },
    });

    // Cleanup temp chunks
    try {
      for (const chunkIdx of uploadedChunks) {
        await unlink(join(uploadDir, `chunk_${chunkIdx}`));
      }
      await unlink(join(uploadDir, '_metadata.json'));
      await rmdir(uploadDir);
    } catch {
      // Non-critical: temp files will be cleaned up later
    }

    return NextResponse.json({
      id: fileItem.id,
      name: fileItem.name,
      type: fileItem.type,
      size: fileItem.size,
      mimeType: fileItem.mimeType,
      parentId: fileItem.parentId ?? 'root',
      starred: fileItem.isStarred,
      trashed: fileItem.isTrashed,
      driverId: fileItem.driverId,
      createdAt: fileItem.createdAt.toISOString(),
      updatedAt: fileItem.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('Error completing chunked upload:', error);
    // Update task record as failed
    try {
      const body = await new Request(error instanceof Error ? '' : '').json().catch(() => ({}));
      if (body.uploadId) {
        await db.taskRecord.updateMany({
          where: { uploadId: body.uploadId },
          data: { status: 'failed', error: String(error) },
        });
      }
    } catch { /* non-critical */ }

    return NextResponse.json(
      { error: 'Failed to complete chunked upload' },
      { status: 500 }
    );
  }
}

// GET /api/files/upload/chunked — Check upload status / resume capability
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return unauthorizedResponse();
    }

    const { searchParams } = request.nextUrl;
    const uploadId = searchParams.get('uploadId');

    if (!uploadId) {
      return NextResponse.json(
        { error: 'uploadId is required' },
        { status: 400 }
      );
    }

    const uploadDir = join(CHUNK_UPLOAD_DIR, uploadId);
    if (!existsSync(uploadDir)) {
      return NextResponse.json(
        { error: 'Upload session not found. It may have expired.', resumable: false },
        { status: 404 }
      );
    }

    // Read metadata
    const metadataRaw = await readFile(join(uploadDir, '_metadata.json'), 'utf-8');
    const metadata = JSON.parse(metadataRaw);

    // Check which chunks are already uploaded
    const files = await readdir(uploadDir);
    const uploadedChunks = files
      .filter((f) => f.startsWith('chunk_'))
      .map((f) => parseInt(f.replace('chunk_', ''), 10))
      .filter((n) => !isNaN(n))
      .sort((a, b) => a - b);

    // Calculate missing chunks
    const missingChunks: number[] = [];
    for (let i = 0; i < metadata.totalChunks; i++) {
      if (!uploadedChunks.includes(i)) {
        missingChunks.push(i);
      }
    }

    const progress = Math.round((uploadedChunks.length / metadata.totalChunks) * 100);

    // Get task record
    const taskRecord = await db.taskRecord.findFirst({
      where: { uploadId },
    });

    return NextResponse.json({
      uploadId,
      resumable: true,
      fileName: metadata.fileName,
      fileSize: metadata.fileSize,
      chunkSize: metadata.chunkSize,
      totalChunks: metadata.totalChunks,
      uploadedChunks,
      missingChunks,
      progress,
      taskStatus: taskRecord?.status ?? 'unknown',
      taskId: taskRecord?.id ?? null,
    });
  } catch (error) {
    console.error('Error checking chunked upload status:', error);
    return NextResponse.json(
      { error: 'Failed to check upload status' },
      { status: 500 }
    );
  }
}
