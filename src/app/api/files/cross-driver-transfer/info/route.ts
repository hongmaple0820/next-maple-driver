import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, unauthorizedResponse } from '@/lib/auth-helpers';
import { isLocalDefault, type TransferFileInfo } from '@/lib/transfer-types';

// Helper: resolve a human-readable driver name from a driverId
async function getDriverName(driverId: string | null): Promise<string> {
  if (isLocalDefault(driverId)) {
    return 'Local Storage (Default)';
  }
  const driver = await db.storageDriver.findUnique({
    where: { id: driverId! },
    select: { name: true },
  });
  return driver?.name ?? 'Unknown Driver';
}

// GET /api/files/cross-driver-transfer/info - Get file info for transfer dialog
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return unauthorizedResponse();
    }
    const userId = (user as Record<string, unknown>).id as string;
    const isAdmin = (user as Record<string, unknown>).role === 'admin';

    const { searchParams } = request.nextUrl;
    const fileIdsParam = searchParams.get('fileIds');
    if (!fileIdsParam) {
      return NextResponse.json({ error: 'fileIds is required' }, { status: 400 });
    }

    const fileIds = fileIdsParam.split(',').filter(Boolean);
    if (fileIds.length === 0) {
      return NextResponse.json({ error: 'No file IDs provided' }, { status: 400 });
    }

    const files = await db.fileItem.findMany({
      where: {
        id: { in: fileIds },
        ...(isAdmin ? {} : { userId }),
      },
      select: {
        id: true,
        name: true,
        type: true,
        size: true,
        driverId: true,
        mimeType: true,
        isTrashed: true,
      },
    });

    // Calculate total size including folder contents
    const result: TransferFileInfo[] = [];
    for (const file of files) {
      if (file.isTrashed) continue;

      const driverName = await getDriverName(file.driverId);

      if (file.type === 'folder') {
        const folderSize = await calculateFolderSize(file.id);
        result.push({
          id: file.id,
          name: file.name,
          type: file.type,
          size: folderSize,
          driverId: file.driverId,
          driverName,
          mimeType: file.mimeType,
        });
      } else {
        result.push({
          id: file.id,
          name: file.name,
          type: file.type,
          size: file.size,
          driverId: file.driverId,
          driverName,
          mimeType: file.mimeType,
        });
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error getting file info for transfer:', error);
    return NextResponse.json({ error: 'Failed to get file info' }, { status: 500 });
  }
}

async function calculateFolderSize(folderId: string): Promise<number> {
  const children = await db.fileItem.findMany({
    where: { parentId: folderId, isTrashed: false },
    select: { id: true, type: true, size: true },
  });

  let totalSize = 0;
  for (const child of children) {
    if (child.type === 'folder') {
      totalSize += await calculateFolderSize(child.id);
    } else {
      totalSize += child.size || 0;
    }
  }

  return totalSize;
}
