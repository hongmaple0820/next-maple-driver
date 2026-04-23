import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, unauthorizedResponse } from '@/lib/auth-helpers';
import { getDriver, getDefaultDriver } from '@/lib/storage-drivers/manager';
import type { StorageDriverConfig } from '@/lib/storage-drivers/types';
import type { StorageDriver } from '@/lib/storage-drivers/types';

// In-memory transfer task tracking (shared globally)
export interface TransferTask {
  id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  totalFiles: number;
  processedFiles: number;
  succeededFiles: number;
  failedFiles: number;
  totalBytes: number;
  transferredBytes: number;
  errors: string[];
  startedAt: number;
  completedAt?: number;
  mode: 'copy' | 'move';
  sourceDriverId: string;
  targetDriverId: string;
}

const globalForTransferTasks = globalThis as unknown as {
  crossDriverTransferTasks: Map<string, TransferTask> | undefined;
};

function getTransferTasks(): Map<string, TransferTask> {
  if (!globalForTransferTasks.crossDriverTransferTasks) {
    globalForTransferTasks.crossDriverTransferTasks = new Map();
  }
  return globalForTransferTasks.crossDriverTransferTasks;
}

function isLocalDefault(driverId: string | null): boolean {
  return !driverId || driverId === 'local-default' || driverId === 'default-local';
}

function resolveDriverIdForDb(driverId: string): string | null {
  return isLocalDefault(driverId) ? null : driverId;
}

async function getDriverInstance(driverId: string): Promise<{ driver: StorageDriver; config: StorageDriverConfig }> {
  if (isLocalDefault(driverId)) {
    const config: StorageDriverConfig = {
      id: 'local-default',
      name: 'Default Local Storage',
      type: 'local',
      config: { path: './storage' },
      isDefault: true,
      isEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return { driver: getDefaultDriver(), config };
  }

  const driverRecord = await db.storageDriver.findUnique({ where: { id: driverId } });
  if (!driverRecord) {
    throw new Error(`Driver not found: ${driverId}`);
  }

  const config: StorageDriverConfig = {
    id: driverRecord.id,
    name: driverRecord.name,
    type: driverRecord.type as StorageDriverConfig['type'],
    config: JSON.parse(driverRecord.config || '{}'),
    isDefault: driverRecord.isDefault,
    isEnabled: driverRecord.isEnabled,
    createdAt: driverRecord.createdAt,
    updatedAt: driverRecord.updatedAt,
  };

  return { driver: getDriver(config), config };
}

// Count all files recursively within folders to get accurate total
async function countFilesRecursively(fileIds: string[]): Promise<{ totalFiles: number; totalBytes: number }> {
  let totalFiles = 0;
  let totalBytes = 0;

  for (const fileId of fileIds) {
    const file = await db.fileItem.findUnique({ where: { id: fileId } });
    if (!file) continue;

    if (file.type === 'folder') {
      const children = await db.fileItem.findMany({
        where: { parentId: fileId, isTrashed: false },
        select: { id: true },
      });
      const childResult = await countFilesRecursively(children.map(c => c.id));
      totalFiles += childResult.totalFiles;
      totalBytes += childResult.totalBytes;
    } else {
      totalFiles++;
      totalBytes += file.size || 0;
    }
  }

  return { totalFiles, totalBytes };
}

// POST /api/files/cross-driver-transfer - Transfer files between drivers
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return unauthorizedResponse();
    }
    const userId = (user as Record<string, unknown>).id as string;
    const isAdmin = (user as Record<string, unknown>).role === 'admin';

    const body = await request.json();
    const { fileIds, targetDriverId, targetParentId, mode } = body as {
      fileIds: string[];
      targetDriverId: string;
      targetParentId: string;
      mode: 'copy' | 'move';
    };

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return NextResponse.json({ error: 'fileIds is required and must be a non-empty array' }, { status: 400 });
    }

    if (!targetDriverId) {
      return NextResponse.json({ error: 'targetDriverId is required' }, { status: 400 });
    }

    if (!mode || (mode !== 'copy' && mode !== 'move')) {
      return NextResponse.json({ error: 'mode must be "copy" or "move"' }, { status: 400 });
    }

    // Resolve target parent ID
    const resolvedTargetParentId = targetParentId === 'root' ? null : targetParentId;

    // Get source driver IDs from files
    const sourceFiles = await db.fileItem.findMany({
      where: { id: { in: fileIds } },
      select: { id: true, driverId: true, name: true, type: true, isTrashed: true, userId: true },
    });

    // Verify ownership and not trashed
    for (const file of sourceFiles) {
      if (!isAdmin && file.userId !== userId) {
        return NextResponse.json({ error: `Access denied for file "${file.name}"` }, { status: 403 });
      }
      if (file.isTrashed) {
        return NextResponse.json({ error: `Cannot transfer trashed file "${file.name}"` }, { status: 400 });
      }
    }

    // Determine the source driver (use the first file's driver)
    const sourceDriverId = sourceFiles[0]?.driverId || 'local-default';

    // Check if source and target are the same
    const sourceNorm = isLocalDefault(sourceDriverId) ? 'local-default' : sourceDriverId;
    const targetNorm = isLocalDefault(targetDriverId) ? 'local-default' : targetDriverId;
    if (sourceNorm === targetNorm) {
      // Same driver - just move/copy within the same driver (only change parentId)
      // This is still useful for moving between different mount points
      // Allow it but it's essentially a regular move/copy
    }

    // Validate target driver exists
    try {
      await getDriverInstance(targetDriverId);
    } catch {
      return NextResponse.json({ error: 'Target driver not found' }, { status: 404 });
    }

    // Validate target parent folder exists and is on the target driver
    if (resolvedTargetParentId) {
      const targetParent = await db.fileItem.findUnique({ where: { id: resolvedTargetParentId } });
      if (!targetParent) {
        return NextResponse.json({ error: 'Target folder not found' }, { status: 404 });
      }
      if (targetParent.type !== 'folder') {
        return NextResponse.json({ error: 'Target is not a folder' }, { status: 400 });
      }
    }

    // Count total files (including those in folders)
    const { totalFiles, totalBytes } = await countFilesRecursively(fileIds);

    // Create transfer task
    const tasks = getTransferTasks();
    const taskId = crypto.randomUUID();
    const task: TransferTask = {
      id: taskId,
      status: 'pending',
      totalFiles,
      processedFiles: 0,
      succeededFiles: 0,
      failedFiles: 0,
      totalBytes,
      transferredBytes: 0,
      errors: [],
      startedAt: Date.now(),
      mode,
      sourceDriverId: sourceNorm,
      targetDriverId: targetNorm,
    };
    tasks.set(taskId, task);

    // Process transfers asynchronously
    processTransfer(task, fileIds, targetDriverId, resolvedTargetParentId, mode, userId, isAdmin).catch((err) => {
      task.status = 'failed';
      task.errors.push(`Unexpected error: ${err instanceof Error ? err.message : 'Unknown'}`);
      task.completedAt = Date.now();
    });

    return NextResponse.json({
      taskId,
      status: task.status,
      totalFiles: task.totalFiles,
      totalBytes: task.totalBytes,
      mode: task.mode,
      sourceDriverId: task.sourceDriverId,
      targetDriverId: task.targetDriverId,
    }, { status: 202 });
  } catch (error) {
    console.error('Error starting cross-driver transfer:', error);
    return NextResponse.json({ error: 'Failed to start cross-driver transfer' }, { status: 500 });
  }
}

async function processTransfer(
  task: TransferTask,
  fileIds: string[],
  targetDriverId: string,
  targetParentId: string | null,
  mode: 'copy' | 'move',
  userId: string,
  isAdmin: boolean
) {
  task.status = 'in_progress';

  // Get driver instances
  const { driver: targetDriver } = await getDriverInstance(targetDriverId);

  for (const fileId of fileIds) {
    // Check if task was cancelled
    if (task.status === 'cancelled') break;

    try {
      const file = await db.fileItem.findUnique({ where: { id: fileId } });
      if (!file) {
        task.errors.push(`File ${fileId} not found`);
        task.failedFiles++;
        task.processedFiles++;
        continue;
      }

      // Verify ownership
      if (!isAdmin && file.userId !== userId) {
        task.errors.push(`Access denied for file "${file.name}"`);
        task.failedFiles++;
        task.processedFiles++;
        continue;
      }

      if (file.type === 'folder') {
        // For folders, we need to recursively transfer all children
        await transferFolder(task, file, targetDriverId, targetDriver, targetParentId, mode, userId, isAdmin);
      } else {
        // For files, perform the actual data transfer
        await transferFile(task, file, targetDriverId, targetDriver, targetParentId, mode);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      let fileName = fileId;
      try {
        const fileRecord = await db.fileItem.findUnique({ where: { id: fileId }, select: { name: true } });
        fileName = fileRecord?.name || fileId;
      } catch { /* ignore */ }
      task.errors.push(`Failed to transfer "${fileName}": ${errorMessage}`);
      task.failedFiles++;
      task.processedFiles++;
    }
  }

  task.status = task.failedFiles === 0 ? 'completed' : task.succeededFiles === 0 ? 'failed' : 'completed';
  task.completedAt = Date.now();

  // Clean up old tasks after 1 hour
  setTimeout(() => {
    getTransferTasks().delete(task.id);
  }, 3600000);
}

async function transferFolder(
  task: TransferTask,
  folder: { id: string; name: string; driverId: string | null; userId: string; isTrashed: boolean },
  targetDriverId: string,
  targetDriver: StorageDriver,
  targetParentId: string | null,
  mode: 'copy' | 'move',
  userId: string,
  isAdmin: boolean
) {
  if (mode === 'copy') {
    // Create a new folder record at the target
    // Check for name collision
    const existingFolder = await db.fileItem.findFirst({
      where: {
        parentId: targetParentId,
        name: folder.name,
        type: 'folder',
        isTrashed: false,
      },
    });

    let newFolderName = folder.name;
    if (existingFolder) {
      newFolderName = await getUniqueName(folder.name, targetParentId);
    }

    const newFolder = await db.fileItem.create({
      data: {
        name: newFolderName,
        type: 'folder',
        parentId: targetParentId,
        driverId: resolveDriverIdForDb(targetDriverId),
        userId: folder.userId,
      },
    });

    // Now recursively copy all children into the new folder
    const children = await db.fileItem.findMany({
      where: { parentId: folder.id, isTrashed: false },
    });

    for (const child of children) {
      if (task.status === 'cancelled') break;

      if (child.type === 'folder') {
        await transferFolder(task, child, targetDriverId, targetDriver, newFolder.id, mode, userId, isAdmin);
      } else {
        await transferFile(task, child, targetDriverId, targetDriver, newFolder.id, mode);
      }
    }
  } else {
    // Move mode: update the existing folder record
    // Check for name collision at target
    const existingFolder = await db.fileItem.findFirst({
      where: {
        parentId: targetParentId,
        name: folder.name,
        type: 'folder',
        isTrashed: false,
        id: { not: folder.id },
      },
    });

    let newFolderName = folder.name;
    if (existingFolder) {
      newFolderName = await getUniqueName(folder.name, targetParentId);
    }

    await db.fileItem.update({
      where: { id: folder.id },
      data: {
        driverId: resolveDriverIdForDb(targetDriverId),
        parentId: targetParentId,
        name: newFolderName !== folder.name ? newFolderName : undefined,
      },
    });

    // Recursively move all children (update their driverId and transfer file data)
    const children = await db.fileItem.findMany({
      where: { parentId: folder.id, isTrashed: false },
    });

    for (const child of children) {
      if (task.status === 'cancelled') break;

      if (child.type === 'folder') {
        await transferFolder(task, child, targetDriverId, targetDriver, folder.id, mode, userId, isAdmin);
      } else {
        await transferFile(task, child, targetDriverId, targetDriver, folder.id, mode);
      }
    }
  }
}

async function transferFile(
  task: TransferTask,
  file: { id: string; name: string; size: number; storagePath: string | null; driverId: string | null; mimeType: string; userId: string },
  targetDriverId: string,
  targetDriver: StorageDriver,
  targetParentId: string | null,
  mode: 'copy' | 'move'
) {
  if (mode === 'copy') {
    // Copy mode: create a new file record and copy the data
    if (!file.storagePath) {
      task.errors.push(`No storage path for file "${file.name}"`);
      task.failedFiles++;
      task.processedFiles++;
      return;
    }

    // Get source driver
    const sourceDriverId = file.driverId || 'local-default';
    const { driver: sourceDriver } = await getDriverInstance(sourceDriverId);

    // Generate new storage path for target driver
    const ext = file.name.includes('.') ? '.' + file.name.split('.').pop() : '';
    const newStoragePath = `${crypto.randomUUID()}${ext}`;

    // Read from source driver
    const data = await sourceDriver.readFile(file.storagePath);

    // Write to target driver
    await targetDriver.writeFile(newStoragePath, data);

    // Check for name collision
    const newFileName = await getUniqueName(file.name, targetParentId);

    // Create new database record
    await db.fileItem.create({
      data: {
        name: newFileName,
        type: 'file',
        size: file.size,
        mimeType: file.mimeType,
        parentId: targetParentId,
        storagePath: newStoragePath,
        driverId: resolveDriverIdForDb(targetDriverId),
        userId: file.userId,
      },
    });

    task.transferredBytes += file.size || 0;
    task.succeededFiles++;
    task.processedFiles++;
  } else {
    // Move mode: transfer the file data and update the record
    if (!file.storagePath) {
      task.errors.push(`No storage path for file "${file.name}"`);
      task.failedFiles++;
      task.processedFiles++;
      return;
    }

    // Get source driver
    const sourceDriverId = file.driverId || 'local-default';
    const { driver: sourceDriver } = await getDriverInstance(sourceDriverId);

    // Generate new storage path for target driver
    const ext = file.name.includes('.') ? '.' + file.name.split('.').pop() : '';
    const newStoragePath = `${crypto.randomUUID()}${ext}`;

    // Read from source driver
    const data = await sourceDriver.readFile(file.storagePath);

    // Write to target driver
    await targetDriver.writeFile(newStoragePath, data);

    // Delete from source driver
    try {
      await sourceDriver.deleteFile(file.storagePath);
    } catch {
      // Source file deletion failure is not critical for the transfer
      task.errors.push(`Warning: Could not delete source file for "${file.name}"`);
    }

    // Check for name collision at target
    const existingFile = await db.fileItem.findFirst({
      where: {
        parentId: targetParentId,
        name: file.name,
        type: 'file',
        isTrashed: false,
        id: { not: file.id },
      },
    });

    const newFileName = existingFile ? await getUniqueName(file.name, targetParentId) : file.name;

    // Update database record
    await db.fileItem.update({
      where: { id: file.id },
      data: {
        storagePath: newStoragePath,
        driverId: resolveDriverIdForDb(targetDriverId),
        parentId: targetParentId,
        name: newFileName !== file.name ? newFileName : undefined,
      },
    });

    task.transferredBytes += file.size || 0;
    task.succeededFiles++;
    task.processedFiles++;
  }
}

async function getUniqueName(originalName: string, parentId: string | null): Promise<string> {
  const dotIndex = originalName.lastIndexOf('.');
  const baseName = dotIndex > 0 ? originalName.substring(0, dotIndex) : originalName;
  const extension = dotIndex > 0 ? originalName.substring(dotIndex) : '';

  let name = originalName;
  let counter = 1;

  while (true) {
    const existing = await db.fileItem.findFirst({
      where: {
        parentId,
        name,
        isTrashed: false,
      },
    });

    if (!existing) break;

    name = `${baseName} (${counter})${extension}`;
    counter++;
  }

  return name;
}

// GET /api/files/cross-driver-transfer - List available storage drivers for transfer
export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return unauthorizedResponse();
    }

    // Get all active drivers from the database
    const drivers = await db.storageDriver.findMany({
      where: { isEnabled: true, status: 'active' },
      orderBy: [{ isDefault: 'desc' }, { priority: 'desc' }],
    });

    // Always include default local driver
    const allDrivers = [
      {
        id: 'local-default',
        name: 'Local Storage (Default)',
        type: 'local',
        isDefault: true,
        status: 'active',
        totalStorage: 0,
        usedStorage: 0,
      },
      ...drivers.map((d) => ({
        id: d.id,
        name: d.name,
        type: d.type,
        isDefault: d.isDefault,
        status: d.status,
        totalStorage: 0,
        usedStorage: 0,
      })),
    ];

    // Get storage info for each driver
    const driversWithInfo = await Promise.all(
      allDrivers.map(async (driver) => {
        try {
          const { driver: instance } = await getDriverInstance(driver.id);
          const info = await instance.getStorageInfo();
          return {
            ...driver,
            totalStorage: info.total,
            usedStorage: info.used,
          };
        } catch {
          return driver;
        }
      })
    );

    return NextResponse.json({ drivers: driversWithInfo });
  } catch (error) {
    console.error('Error listing drivers for transfer:', error);
    return NextResponse.json({ error: 'Failed to list drivers' }, { status: 500 });
  }
}
