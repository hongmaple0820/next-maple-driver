import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { join } from 'path';
import { existsSync } from 'fs';
import { writeFile, mkdir } from 'fs/promises';
import { getAuthUser, unauthorizedResponse } from '@/lib/auth-helpers';
import AdmZip from 'adm-zip';

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return unauthorizedResponse();
    }
    const userId = (user as Record<string, unknown>).id as string;

    const body = await request.json();
    const { fileId } = body as { fileId: string };

    if (!fileId) {
      return NextResponse.json(
        { error: 'File ID is required' },
        { status: 400 }
      );
    }

    // Find the file in the database
    const fileItem = await db.fileItem.findFirst({
      where: {
        id: fileId,
        type: 'file',
        isTrashed: false,
        userId,
      },
    });

    if (!fileItem) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    // Check if the file is a zip archive
    const ext = fileItem.name.includes('.') ? fileItem.name.split('.').pop()!.toLowerCase() : '';
    const mime = fileItem.mimeType?.toLowerCase() || '';

    const isZip = ext === 'zip' || mime.includes('zip');

    if (!isZip) {
      return NextResponse.json(
        { error: 'Only ZIP files are supported for extraction' },
        { status: 400 }
      );
    }

    // Check if the file exists on disk
    const STORAGE_PATH = join(process.cwd(), 'storage');
    const filePath = fileItem.storagePath ? join(STORAGE_PATH, fileItem.storagePath) : null;

    if (!filePath || !existsSync(filePath)) {
      return NextResponse.json(
        { error: 'File not found on disk' },
        { status: 404 }
      );
    }

    // Extract the zip file
    const zip = new AdmZip(filePath);
    const zipEntries = zip.getEntries();

    if (zipEntries.length === 0) {
      return NextResponse.json(
        { error: 'The ZIP archive is empty' },
        { status: 400 }
      );
    }

    // Determine the parent folder for extraction
    // Extract into the same parent folder as the zip file
    const parentFolderId = fileItem.parentId; // null means root

    // Also create a subfolder named after the zip file (without extension)
    const zipBaseName = fileItem.name.includes('.')
      ? fileItem.name.substring(0, fileItem.name.lastIndexOf('.'))
      : fileItem.name;

    // Check for duplicate folder name
    const existingFolder = await db.fileItem.findFirst({
      where: {
        parentId: parentFolderId,
        name: zipBaseName,
        type: 'folder',
        isTrashed: false,
        userId,
      },
    });

    let extractionFolderName = zipBaseName;
    if (existingFolder) {
      let counter = 1;
      while (true) {
        const candidateName = `${zipBaseName} (${counter})`;
        const dupCheck = await db.fileItem.findFirst({
          where: { parentId: parentFolderId, name: candidateName, type: 'folder', isTrashed: false, userId },
        });
        if (!dupCheck) {
          extractionFolderName = candidateName;
          break;
        }
        counter++;
      }
    }

    // Create the extraction root folder
    const extractionFolderId = crypto.randomUUID();
    await db.fileItem.create({
      data: {
        id: extractionFolderId,
        name: extractionFolderName,
        type: 'folder',
        size: 0,
        mimeType: '',
        parentId: parentFolderId,
        userId,
      },
    });

    // Track created folder IDs for nested structure
    // key: relative path (without trailing slash), value: database ID
    const folderMap = new Map<string, string>();
    folderMap.set('', extractionFolderId);

    const results = [];
    const createdIds = [extractionFolderId];

    // Sort entries so directories come before files (ensures parent folders exist)
    const sortedEntries = [...zipEntries].sort((a, b) => {
      const aIsDir = a.isDirectory;
      const bIsDir = b.isDirectory;
      if (aIsDir && !bIsDir) return -1;
      if (!aIsDir && bIsDir) return 1;
      return a.entryName.localeCompare(b.entryName);
    });

    for (const entry of sortedEntries) {
      // Skip __MACOSX and other hidden macOS metadata
      const entryName = entry.entryName;
      if (entryName.startsWith('__MACOSX') || entryName.includes('/__MACOSX')) {
        continue;
      }
      // Skip hidden files starting with ._
      const parts = entryName.split('/');
      if (parts.some(p => p.startsWith('._'))) {
        continue;
      }

      const isDirectory = entry.isDirectory;
      const pathParts = entryName.split('/').filter(Boolean);

      if (pathParts.length === 0) continue;

      // Get parent path (everything except last part)
      const parentPath = pathParts.slice(0, -1).join('/');
      const itemName = pathParts[pathParts.length - 1];

      // Ensure all parent directories exist
      let currentPath = '';
      for (let i = 0; i < pathParts.length - 1; i++) {
        const prevPath = currentPath;
        currentPath = currentPath ? `${currentPath}/${pathParts[i]}` : pathParts[i];

        if (!folderMap.has(currentPath)) {
          const folderId = crypto.randomUUID();
          const parentFolderId = folderMap.get(prevPath) || extractionFolderId;

          // Check for duplicate name in parent
          const existingItem = await db.fileItem.findFirst({
            where: {
              parentId: parentFolderId,
              name: pathParts[i],
              type: 'folder',
              isTrashed: false,
              userId,
            },
          });

          if (existingItem) {
            folderMap.set(currentPath, existingItem.id);
          } else {
            await db.fileItem.create({
              data: {
                id: folderId,
                name: pathParts[i],
                type: 'folder',
                size: 0,
                mimeType: '',
                parentId: parentFolderId,
                userId,
              },
            });
            folderMap.set(currentPath, folderId);
            createdIds.push(folderId);
          }
        }
      }

      if (isDirectory) {
        // Create the directory entry
        const dirPath = pathParts.join('/');
        if (!folderMap.has(dirPath)) {
          const dirId = crypto.randomUUID();
          const dirParentId = folderMap.get(parentPath) || extractionFolderId;

          const existingDir = await db.fileItem.findFirst({
            where: {
              parentId: dirParentId,
              name: itemName,
              type: 'folder',
              isTrashed: false,
              userId,
            },
          });

          if (existingDir) {
            folderMap.set(dirPath, existingDir.id);
          } else {
            await db.fileItem.create({
              data: {
                id: dirId,
                name: itemName,
                type: 'folder',
                size: 0,
                mimeType: '',
                parentId: dirParentId,
                userId,
              },
            });
            folderMap.set(dirPath, dirId);
            createdIds.push(dirId);

            results.push({
              id: dirId,
              name: itemName,
              type: 'folder',
              size: 0,
              mimeType: '',
              parentId: dirParentId,
              starred: false,
              trashed: false,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }
        }
      } else {
        // It's a file - extract and save
        const fileParentId = folderMap.get(parentPath) || extractionFolderId;

        // Check for duplicate name
        const existingFile = await db.fileItem.findFirst({
          where: {
            parentId: fileParentId,
            name: itemName,
            isTrashed: false,
            userId,
          },
        });

        let finalName = itemName;
        if (existingFile) {
          const nameWithoutExt = itemName.includes('.')
            ? itemName.substring(0, itemName.lastIndexOf('.'))
            : itemName;
          const extension = itemName.includes('.')
            ? itemName.substring(itemName.lastIndexOf('.'))
            : '';
          let counter = 1;
          while (true) {
            const candidateName = `${nameWithoutExt} (${counter})${extension}`;
            const dupCheck = await db.fileItem.findFirst({
              where: { parentId: fileParentId, name: candidateName, isTrashed: false, userId },
            });
            if (!dupCheck) {
              finalName = candidateName;
              break;
            }
            counter++;
          }
        }

        // Extract file data
        const fileData = entry.getData();
        const newFileId = crypto.randomUUID();
        const fileExt = finalName.includes('.') ? '.' + finalName.split('.').pop() : '';
        const storageName = `${newFileId}${fileExt}`;
        const storageFilePath = join(STORAGE_PATH, storageName);

        // Ensure storage directory exists
        if (!existsSync(STORAGE_PATH)) {
          await mkdir(STORAGE_PATH, { recursive: true });
        }

        // Write file to disk
        await writeFile(storageFilePath, fileData);

        // Determine MIME type
        const mimeType = getMimeType(finalName);

        // Create database record
        const newFileItem = await db.fileItem.create({
          data: {
            id: newFileId,
            name: finalName,
            type: 'file',
            size: fileData.length,
            mimeType,
            parentId: fileParentId,
            storagePath: storageName,
            userId,
          },
        });

        createdIds.push(newFileId);

        results.push({
          id: newFileItem.id,
          name: newFileItem.name,
          type: newFileItem.type,
          size: newFileItem.size,
          mimeType: newFileItem.mimeType,
          parentId: newFileItem.parentId ?? 'root',
          starred: newFileItem.isStarred,
          trashed: newFileItem.isTrashed,
          createdAt: newFileItem.createdAt.toISOString(),
          updatedAt: newFileItem.updatedAt.toISOString(),
        });
      }
    }

    return NextResponse.json({
      message: 'Extraction complete',
      extractedCount: results.length,
      folderId: extractionFolderId,
      folderName: extractionFolderName,
      items: results,
    }, { status: 201 });
  } catch (error) {
    console.error('Error extracting file:', error);
    return NextResponse.json(
      { error: 'Failed to extract file' },
      { status: 500 }
    );
  }
}

// Simple MIME type lookup
function getMimeType(filename: string): string {
  const ext = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : '';
  const mimeMap: Record<string, string> = {
    // Images
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon',
    // Videos
    mp4: 'video/mp4', webm: 'video/webm', avi: 'video/x-msvideo', mov: 'video/quicktime',
    mkv: 'video/x-matroska', flv: 'video/x-flv',
    // Audio
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac',
    aac: 'audio/aac', m4a: 'audio/mp4',
    // Documents
    pdf: 'application/pdf', doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain', rtf: 'application/rtf', csv: 'text/csv',
    // Code
    js: 'application/javascript', ts: 'application/typescript',
    html: 'text/html', css: 'text/css', json: 'application/json',
    xml: 'application/xml', py: 'text/x-python', java: 'text/x-java-source',
    // Archives
    zip: 'application/zip', rar: 'application/x-rar-compressed',
    tar: 'application/x-tar', gz: 'application/gzip', '7z': 'application/x-7z-compressed',
  };
  return mimeMap[ext] || 'application/octet-stream';
}
