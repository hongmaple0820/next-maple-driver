import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, unauthorizedResponse } from '@/lib/auth-helpers';
import { getDriver, getDefaultDriver } from '@/lib/storage-drivers/manager';
import type { StorageDriverConfig } from '@/lib/storage-drivers/types';

// In-memory transfer task tracking (shared globally)
export interface TransferTask {
  id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  totalFiles: number;
  processedFiles: number;
  succeededFiles: number;
  failedFiles: number;
  errors: string[];
  startedAt: number;
  completedAt?: number;
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

    // Get target driver config
    let targetDriverConfig: StorageDriverConfig;
    if (targetDriverId === 'local-default' || targetDriverId === 'default-local') {
      targetDriverConfig = {
        id: targetDriverId,
        name: 'Default Local Storage',
        type: 'local',
        config: { path: './storage' },
        isDefault: true,
        isEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } else {
      const driverRecord = await db.storageDriver.findUnique({ where: { id: targetDriverId } });
      if (!driverRecord) {
        return NextResponse.json({ error: 'Target driver not found' }, { status: 404 });
      }
      targetDriverConfig = {
        id: driverRecord.id,
        name: driverRecord.name,
        type: driverRecord.type as 'local' | 'webdav' | 's3' | 'mount',
        config: JSON.parse(driverRecord.config || '{}'),
        isDefault: driverRecord.isDefault,
        isEnabled: driverRecord.isEnabled,
        createdAt: driverRecord.createdAt,
        updatedAt: driverRecord.updatedAt,
      };
    }

    // Get target driver instance
    const targetDriver = getDriver(targetDriverConfig);

    // Create transfer task
    const tasks = getTransferTasks();
    const taskId = crypto.randomUUID();
    const task: TransferTask = {
      id: taskId,
      status: 'pending',
      totalFiles: fileIds.length,
      processedFiles: 0,
      succeededFiles: 0,
      failedFiles: 0,
      errors: [],
      startedAt: Date.now(),
    };
    tasks.set(taskId, task);

    // Process transfers asynchronously
    processTransfer(task, fileIds, targetDriverId, targetDriver, resolvedTargetParentId, mode, userId, isAdmin).catch(() => {
      task.status = 'failed';
      task.completedAt = Date.now();
    });

    return NextResponse.json({
      taskId,
      status: task.status,
      totalFiles: task.totalFiles,
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
  targetDriver: ReturnType<typeof getDriver>,
  targetParentId: string | null,
  mode: 'copy' | 'move',
  userId: string,
  isAdmin: boolean
) {
  task.status = 'in_progress';

  for (const fileId of fileIds) {
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
        // For folders, update driverId and parentId, recursively update children
        await db.fileItem.update({
          where: { id: fileId },
          data: {
            driverId: isLocalDefault(targetDriverId) ? null : targetDriverId,
            parentId: targetParentId,
          },
        });

        // Recursively update children's driverId
        await updateChildrenDriverId(fileId, targetDriverId);

        task.succeededFiles++;
        task.processedFiles++;
        continue;
      }

      // For files, perform the actual data transfer
      const sourceDriverId = file.driverId || 'local-default';
      let sourceDriver: ReturnType<typeof getDriver>;

      if (!file.driverId || isLocalDefault(file.driverId)) {
        sourceDriver = getDefaultDriver();
      } else {
        const sourceDriverRecord = await db.storageDriver.findUnique({ where: { id: sourceDriverId } });
        if (!sourceDriverRecord) {
          task.errors.push(`Source driver not found for file "${file.name}"`);
          task.failedFiles++;
          task.processedFiles++;
          continue;
        }
        const sourceConfig: StorageDriverConfig = {
          id: sourceDriverRecord.id,
          name: sourceDriverRecord.name,
          type: sourceDriverRecord.type as 'local' | 'webdav' | 's3' | 'mount',
          config: JSON.parse(sourceDriverRecord.config || '{}'),
          isDefault: sourceDriverRecord.isDefault,
          isEnabled: sourceDriverRecord.isEnabled,
          createdAt: sourceDriverRecord.createdAt,
          updatedAt: sourceDriverRecord.updatedAt,
        };
        sourceDriver = getDriver(sourceConfig);
      }

      // Generate new storage path for target driver
      const ext = file.name.includes('.') ? '.' + file.name.split('.').pop() : '';
      const newStoragePath = `${crypto.randomUUID()}${ext}`;

      // Read from source driver
      if (!file.storagePath) {
        task.errors.push(`No storage path for file "${file.name}"`);
        task.failedFiles++;
        task.processedFiles++;
        continue;
      }

      const data = await sourceDriver.readFile(file.storagePath);

      // Write to target driver
      await targetDriver.writeFile(newStoragePath, data);

      // If move mode, delete from source driver
      if (mode === 'move') {
        try {
          await sourceDriver.deleteFile(file.storagePath);
        } catch {
          // Source file deletion failure is not critical for the transfer
          task.errors.push(`Warning: Could not delete source file for "${file.name}"`);
        }
      }

      // Update database record
      const updatedDriverId = isLocalDefault(targetDriverId) ? null : targetDriverId;
      await db.fileItem.update({
        where: { id: fileId },
        data: {
          storagePath: newStoragePath,
          driverId: updatedDriverId,
          parentId: targetParentId,
        },
      });

      task.succeededFiles++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const fileRecord = await db.fileItem.findUnique({ where: { id: fileId }, select: { name: true } });
      task.errors.push(`Failed to transfer "${fileRecord?.name || fileId}": ${errorMessage}`);
      task.failedFiles++;
    } finally {
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

function isLocalDefault(driverId: string | null): boolean {
  return !driverId || driverId === 'local-default' || driverId === 'default-local';
}

async function updateChildrenDriverId(parentId: string, driverId: string) {
  const children = await db.fileItem.findMany({
    where: { parentId },
    select: { id: true },
  });

  const resolvedDriverId = isLocalDefault(driverId) ? null : driverId;

  for (const child of children) {
    await db.fileItem.update({
      where: { id: child.id },
      data: { driverId: resolvedDriverId },
    });
    // Recursively update children
    await updateChildrenDriverId(child.id, driverId);
  }
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
      },
      ...drivers.map((d) => ({
        id: d.id,
        name: d.name,
        type: d.type,
        isDefault: d.isDefault,
        status: d.status,
      })),
    ];

    return NextResponse.json({ drivers: allDrivers });
  } catch (error) {
    console.error('Error listing drivers for transfer:', error);
    return NextResponse.json({ error: 'Failed to list drivers' }, { status: 500 });
  }
}
