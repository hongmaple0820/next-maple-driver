import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { getAuthUser, unauthorizedResponse } from '@/lib/auth-helpers';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return unauthorizedResponse();
    }
    const userId = (user as Record<string, unknown>).id as string;

    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const parentIdParam = (formData.get('parentId') as string) || 'root';
    const parentId = parentIdParam === 'root' ? null : parentIdParam;
    const driverId = (formData.get('driverId') as string) || null;

    // Folder upload support: paths JSON maps file index to relative path
    // e.g. {"0": "MyFolder/sub/file.txt", "1": "MyFolder/other.txt"}
    const pathsRaw = formData.get('paths') as string | null;
    const paths: Record<string, string> = pathsRaw ? JSON.parse(pathsRaw) : {};

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      );
    }

    // Ensure storage directory exists
    const STORAGE_PATH = join(process.cwd(), 'storage');
    if (!existsSync(STORAGE_PATH)) {
      await mkdir(STORAGE_PATH, { recursive: true });
    }

    // For folder uploads, we need to track created folder paths
    // key: relative folder path (e.g., "MyFolder/sub"), value: database ID
    const folderCache = new Map<string, string>();
    const results = [];

    for (let fileIdx = 0; fileIdx < files.length; fileIdx++) {
      const file = files[fileIdx];

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File "${file.name}" exceeds 100MB size limit` },
          { status: 413 }
        );
      }

      // Check if this file has a relative path (folder upload)
      const relativePath = paths[String(fileIdx)];

      if (relativePath) {
        // Folder upload: parse the path and create folder structure
        const pathParts = relativePath.split('/').filter(Boolean);

        // The last part is the file name, everything else is folder path
        if (pathParts.length < 2) {
          // File is at root of the folder - just use regular upload
          const result = await uploadSingleFile(file, parentId, userId, STORAGE_PATH, driverId);
          results.push(result);
          continue;
        }

        // Create folder structure
        const folderPathParts = pathParts.slice(0, -1);
        let currentParentId = parentId;

        for (const folderName of folderPathParts) {
          // Build the cache key for this folder path level
          const cacheKey = folderPathParts.slice(0, folderPathParts.indexOf(folderName) + 1).join('/');

          if (folderCache.has(cacheKey)) {
            currentParentId = folderCache.get(cacheKey)!;
            continue;
          }

          // Check if folder already exists in this parent
          const existingFolder = await db.fileItem.findFirst({
            where: {
              parentId: currentParentId,
              name: folderName,
              type: 'folder',
              isTrashed: false,
              userId,
            },
          });

          if (existingFolder) {
            folderCache.set(cacheKey, existingFolder.id);
            currentParentId = existingFolder.id;
          } else {
            // Create the folder
            const folderId = crypto.randomUUID();
            await db.fileItem.create({
              data: {
                id: folderId,
                name: folderName,
                type: 'folder',
                size: 0,
                mimeType: '',
                parentId: currentParentId,
                userId,
                driverId,
              },
            });
            folderCache.set(cacheKey, folderId);
            currentParentId = folderId;
          }
        }

        // Upload the file to the deepest folder
        const result = await uploadSingleFile(file, currentParentId, userId, STORAGE_PATH, driverId);
        results.push(result);
      } else {
        // Regular single file upload
        const result = await uploadSingleFile(file, parentId, userId, STORAGE_PATH, driverId);
        results.push(result);
      }
    }

    return NextResponse.json(
      files.length === 1 && !pathsRaw ? results[0] : results,
      { status: 201 }
    );
  } catch (error) {
    console.error('Error uploading files:', error);
    return NextResponse.json(
      { error: 'Failed to upload files' },
      { status: 500 }
    );
  }
}

async function uploadSingleFile(
  file: File,
  parentId: string | null,
  userId: string,
  storagePath: string,
  driverId: string | null = null
) {
  // Generate unique storage name
  const fileId = crypto.randomUUID();
  const ext = file.name.includes('.') ? '.' + file.name.split('.').pop() : '';
  const storageName = `${fileId}${ext}`;
  const filePath = join(storagePath, storageName);

  // Write file to disk
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  // Check for duplicate name in same parent
  const existing = await db.fileItem.findFirst({
    where: {
      parentId,
      name: file.name,
      isTrashed: false,
      userId,
    },
  });

  let fileName = file.name;
  if (existing) {
    const nameWithoutExt = file.name.includes('.')
      ? file.name.substring(0, file.name.lastIndexOf('.'))
      : file.name;
    const extension = file.name.includes('.')
      ? file.name.substring(file.name.lastIndexOf('.'))
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
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
      parentId,
      storagePath: storageName,
      userId,
      driverId,
    },
  });

  return {
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
  };
}
