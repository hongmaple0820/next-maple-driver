import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { rename, mkdir } from 'fs/promises';
import { join } from 'path';
import { getAuthUser, unauthorizedResponse } from '@/lib/auth-helpers';

const STORAGE_PATH = join(process.cwd(), 'storage');

// Parse a rename pattern for a single file
function parsePattern(
  pattern: string,
  originalName: string,
  index: number,
  createdAt: Date
): string {
  // Extract name without extension and extension
  const lastDotIndex = originalName.lastIndexOf('.');
  const name = lastDotIndex > 0 ? originalName.substring(0, lastDotIndex) : originalName;
  const ext = lastDotIndex > 0 ? originalName.substring(lastDotIndex + 1) : '';

  // Format date as YYYY-MM-DD
  const dateStr = createdAt.toISOString().split('T')[0];

  let result = pattern;

  // Replace {i:0} first (zero-padded number) - determine padding from pattern context
  // We'll use a simple heuristic: pad to 2 digits minimum
  result = result.replace(/\{i:(\d+)\}/g, (_match, padStr: string) => {
    const padLength = parseInt(padStr, 10);
    return String(index).padStart(padLength, '0');
  });

  // Replace {i} with sequential number
  result = result.replace(/\{i\}/g, String(index));

  // Replace {name} with original filename (without extension)
  result = result.replace(/\{name\}/g, name);

  // Replace {ext} with file extension
  result = result.replace(/\{ext\}/g, ext);

  // Replace {date} with creation date
  result = result.replace(/\{date\}/g, dateStr);

  return result;
}

// POST /api/files/batch-rename - Batch rename files with a pattern
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return unauthorizedResponse();
    }
    const userId = (user as Record<string, unknown>).id as string;
    const isAdmin = (user as Record<string, unknown>).role === 'admin';

    const body = await request.json();
    const { fileIds, pattern, startIndex = 1, step = 1 } = body;

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return NextResponse.json(
        { error: 'File IDs are required' },
        { status: 400 }
      );
    }

    if (!pattern || typeof pattern !== 'string' || pattern.trim() === '') {
      return NextResponse.json(
        { error: 'Pattern is required' },
        { status: 400 }
      );
    }

    const trimmedPattern = pattern.trim();

    // Fetch all files to rename
    const whereClause: Record<string, unknown> = {
      id: { in: fileIds },
      isTrashed: false,
    };
    if (!isAdmin) {
      whereClause.userId = userId;
    }

    const files = await db.fileItem.findMany({
      where: whereClause,
      orderBy: [{ type: 'desc' }, { name: 'asc' }],
    });

    if (files.length === 0) {
      return NextResponse.json(
        { error: 'No valid files found' },
        { status: 404 }
      );
    }

    // Build the new names mapping
    const renameMap: Array<{
      id: string;
      oldName: string;
      newName: string;
      file: (typeof files)[0];
    }> = [];

    let index = startIndex;
    for (const file of files) {
      const newName = parsePattern(
        trimmedPattern,
        file.name,
        index,
        file.createdAt
      );
      renameMap.push({
        id: file.id,
        oldName: file.name,
        newName,
        file,
      });
      index += step;
    }

    // Check for duplicate new names within the batch
    const newNames = renameMap.map((r) => r.newName);
    const duplicateNames = newNames.filter(
      (name, i) => newNames.indexOf(name) !== i
    );
    if (duplicateNames.length > 0) {
      return NextResponse.json(
        {
          error: `Duplicate names would be created: ${duplicateNames.join(', ')}`,
        },
        { status: 409 }
      );
    }

    // Check for name collisions with existing files in the same folders
    for (const item of renameMap) {
      if (item.newName === item.oldName) continue;

      const existing = await db.fileItem.findFirst({
        where: {
          parentId: item.file.parentId,
          name: item.newName,
          isTrashed: false,
          id: { not: item.id },
        },
      });

      if (existing) {
        return NextResponse.json(
          {
            error: `Name "${item.newName}" already exists in the target location`,
          },
          { status: 409 }
        );
      }
    }

    // Perform the renames
    const results = [];
    for (const item of renameMap) {
      if (item.newName === item.oldName) {
        // No change needed, just return the file as-is
        results.push({
          id: item.file.id,
          name: item.file.name,
          type: item.file.type,
          size: item.file.size,
          mimeType: item.file.mimeType,
          parentId: item.file.parentId ?? 'root',
          starred: item.file.isStarred,
          trashed: item.file.isTrashed,
          createdAt: item.file.createdAt.toISOString(),
          updatedAt: item.file.updatedAt.toISOString(),
        });
        continue;
      }

      // For files with physical storage, rename the physical file
      if (item.file.type === 'file' && item.file.storagePath) {
        const oldFilePath = join(STORAGE_PATH, item.file.storagePath);
        const newStorageName = `${item.file.id}_${item.newName}`;
        const newFilePath = join(STORAGE_PATH, newStorageName);

        await mkdir(STORAGE_PATH, { recursive: true });
        try {
          await rename(oldFilePath, newFilePath);
        } catch {
          // Physical file might not exist, continue with DB update
        }

        // Update the database with new name and storage path
        const updated = await db.fileItem.update({
          where: { id: item.id },
          data: {
            name: item.newName,
            storagePath: newStorageName,
          },
        });

        results.push({
          id: updated.id,
          name: updated.name,
          type: updated.type,
          size: updated.size,
          mimeType: updated.mimeType,
          parentId: updated.parentId ?? 'root',
          starred: updated.isStarred,
          trashed: updated.isTrashed,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        });
      } else {
        // Folder or file without storage path - just update the name
        const updated = await db.fileItem.update({
          where: { id: item.id },
          data: { name: item.newName },
        });

        results.push({
          id: updated.id,
          name: updated.name,
          type: updated.type,
          size: updated.size,
          mimeType: updated.mimeType,
          parentId: updated.parentId ?? 'root',
          starred: updated.isStarred,
          trashed: updated.isTrashed,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        });
      }
    }

    return NextResponse.json({ updated: results });
  } catch (error) {
    console.error('Error batch renaming files:', error);
    return NextResponse.json(
      { error: 'Failed to batch rename files' },
      { status: 500 }
    );
  }
}
