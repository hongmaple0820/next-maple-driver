import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createHash } from 'crypto';
import { readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { getAuthUser, unauthorizedResponse } from '@/lib/auth-helpers';

const STORAGE_DIR = join(process.cwd(), 'storage');

// In-memory cache for MD5 hashes (key: file id, value: { hash, mtime })
const hashCache = new Map<string, { hash: string; mtime: number }>();

// Recursively calculate folder stats
async function getFolderStats(folderId: string): Promise<{ totalSize: number; fileCount: number; folderCount: number }> {
  let totalSize = 0;
  let fileCount = 0;
  let folderCount = 0;

  const children = await db.fileItem.findMany({
    where: { parentId: folderId, isTrashed: false },
    select: { id: true, type: true, size: true, storagePath: true },
  });

  for (const child of children) {
    if (child.type === 'folder') {
      folderCount++;
      const subStats = await getFolderStats(child.id);
      totalSize += subStats.totalSize;
      fileCount += subStats.fileCount;
      folderCount += subStats.folderCount;
    } else {
      fileCount++;
      totalSize += child.size || 0;
    }
  }

  return { totalSize, fileCount, folderCount };
}

// GET /api/files/properties/[id] - Get detailed file properties including MD5 hash
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return unauthorizedResponse();
    }
    const userId = (user as Record<string, unknown>).id as string;
    const isAdmin = (user as Record<string, unknown>).role === 'admin';

    const { id } = await params;

    const file = await db.fileItem.findUnique({
      where: { id },
      include: {
        shares: {
          select: {
            id: true,
            token: true,
            downloadCount: true,
            createdAt: true,
            expiresAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Verify ownership (unless admin)
    if (!isAdmin && file.userId !== userId) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const result: Record<string, unknown> = {
      id: file.id,
      name: file.name,
      type: file.type,
      mimeType: file.mimeType || null,
      size: file.size,
      createdAt: file.createdAt.toISOString(),
      updatedAt: file.updatedAt.toISOString(),
      starred: file.isStarred,
      trashed: file.isTrashed,
      description: file.description || null,
      parentId: file.parentId ?? 'root',
    };

    // For files: calculate MD5 hash with caching
    if (file.type === 'file' && file.storagePath) {
      const fullPath = join(STORAGE_DIR, file.storagePath);

      if (existsSync(fullPath)) {
        const fileStat = statSync(fullPath);
        const mtime = fileStat.mtimeMs;
        const cached = hashCache.get(file.id);

        // Use cached hash if file hasn't been modified
        if (cached && cached.mtime === mtime) {
          result.md5Hash = cached.hash;
        } else {
          try {
            const fileBuffer = readFileSync(fullPath);
            const hash = createHash('md5').update(fileBuffer).digest('hex');
            hashCache.set(file.id, { hash, mtime });
            result.md5Hash = hash;
          } catch {
            result.md5Hash = null;
          }
        }
      } else {
        result.md5Hash = null;
      }
    }

    // For folders: calculate total size and file count
    if (file.type === 'folder') {
      const stats = await getFolderStats(file.id);
      result.folderStats = stats;
    }

    // Include share history
    result.shares = file.shares.map((share) => ({
      id: share.id,
      token: share.token,
      downloadCount: share.downloadCount,
      createdAt: share.createdAt.toISOString(),
      expiresAt: share.expiresAt?.toISOString() || null,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error getting file properties:', error);
    return NextResponse.json(
      { error: 'Failed to get file properties' },
      { status: 500 }
    );
  }
}
