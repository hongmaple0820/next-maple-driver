import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { copyFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import crypto from 'crypto';

const STORAGE_PATH = join(process.cwd(), 'storage');

// GET /api/files/versions/[id] - List all versions of a file
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const file = await db.fileItem.findUnique({ where: { id } });
    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const versions = await db.fileVersion.findMany({
      where: { fileId: id },
      orderBy: { version: 'desc' },
    });

    const result = versions.map((v) => ({
      id: v.id,
      name: v.name,
      size: v.size,
      mimeType: v.mimeType,
      version: v.version,
      createdAt: v.createdAt.toISOString(),
    }));

    // Get current version number: max of existing versions + 0 (no versions yet)
    const currentVersion =
      versions.length > 0 ? Math.max(...versions.map((v) => v.version)) + 1 : 1;

    return NextResponse.json({
      versions: result,
      currentVersion,
    });
  } catch (error) {
    console.error('Error listing versions:', error);
    return NextResponse.json(
      { error: 'Failed to list versions' },
      { status: 500 }
    );
  }
}

// POST /api/files/versions/[id] - Create a new version snapshot
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const file = await db.fileItem.findUnique({ where: { id } });
    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    if (file.type === 'folder') {
      return NextResponse.json(
        { error: 'Cannot create version for folders' },
        { status: 400 }
      );
    }

    // Get max version number from existing versions
    const existingVersions = await db.fileVersion.findMany({
      where: { fileId: id },
      orderBy: { version: 'desc' },
      take: 1,
    });

    const maxVersion = existingVersions.length > 0 ? existingVersions[0].version : 0;
    const newVersion = maxVersion + 1;

    // Copy the physical file to a versioned path
    let versionStoragePath: string | null = null;
    if (file.storagePath) {
      const originalFilePath = join(STORAGE_PATH, file.storagePath);
      const versionedRelativePath = `${file.storagePath}.v${newVersion}`;
      const versionedFilePath = join(STORAGE_PATH, versionedRelativePath);

      try {
        // Ensure directory exists
        await mkdir(dirname(versionedFilePath), { recursive: true });
        await copyFile(originalFilePath, versionedFilePath);
        versionStoragePath = versionedRelativePath;
      } catch (err) {
        console.error('Error copying file for version:', err);
        // If file copy fails, still create the version record without storagePath
        versionStoragePath = null;
      }
    }

    const version = await db.fileVersion.create({
      data: {
        id: crypto.randomUUID(),
        fileId: file.id,
        name: file.name,
        size: file.size,
        mimeType: file.mimeType,
        storagePath: versionStoragePath,
        version: newVersion,
      },
    });

    return NextResponse.json(
      {
        id: version.id,
        name: version.name,
        size: version.size,
        mimeType: version.mimeType,
        version: version.version,
        createdAt: version.createdAt.toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating version:', error);
    return NextResponse.json(
      { error: 'Failed to create version' },
      { status: 500 }
    );
  }
}

// PATCH /api/files/versions/[id] - Restore a specific version
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { versionId } = body;

    if (!versionId) {
      return NextResponse.json(
        { error: 'Version ID is required' },
        { status: 400 }
      );
    }

    const file = await db.fileItem.findUnique({ where: { id } });
    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const version = await db.fileVersion.findUnique({
      where: { id: versionId },
    });
    if (!version || version.fileId !== id) {
      return NextResponse.json(
        { error: 'Version not found for this file' },
        { status: 404 }
      );
    }

    // Copy versioned file back to current storage path if available
    if (version.storagePath && file.storagePath) {
      const versionedFilePath = join(STORAGE_PATH, version.storagePath);
      const currentFilePath = join(STORAGE_PATH, file.storagePath);

      try {
        await mkdir(dirname(currentFilePath), { recursive: true });
        await copyFile(versionedFilePath, currentFilePath);
      } catch (err) {
        console.error('Error restoring file from version:', err);
        // Continue with metadata update even if file copy fails
      }
    }

    // Update the file's metadata to match the version
    const updated = await db.fileItem.update({
      where: { id },
      data: {
        name: version.name,
        size: version.size,
        mimeType: version.mimeType,
      },
    });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      type: updated.type,
      size: updated.size,
      mimeType: updated.mimeType,
      parentId: updated.parentId ?? 'root',
      starred: updated.isStarred,
      trashed: updated.isTrashed,
      description: updated.description,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('Error restoring version:', error);
    return NextResponse.json(
      { error: 'Failed to restore version' },
      { status: 500 }
    );
  }
}
