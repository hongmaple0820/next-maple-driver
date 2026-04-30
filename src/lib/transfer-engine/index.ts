/**
 * Transfer Engine — Unified cross-driver transfer with streaming support
 *
 * Capabilities:
 *  - Copy/move files between ANY two drivers (local, S3, WebDAV, FTP, cloud drives)
 *  - Streaming transfer when both drivers support it (avoids loading entire files in memory)
 *  - Falls back to buffer-based transfer when streaming isn't available
 *  - Byte-level progress tracking with speed calculation
 *  - Cancellation via AbortController
 *  - Auto-creates destination directories
 */

import type { StorageDriver, StorageDriverConfig } from '../storage-drivers/types';
import { getDriver, getDefaultDriver } from '../storage-drivers/manager';
import { resolveVirtualPath } from '../vfs';
import { db } from '../db';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Transfer operation type */
export type TransferOperation = 'copy' | 'move';

/** Transfer status */
export type TransferStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'completed_with_errors';

/** Result of transferring a single file */
export interface FileTransferResult {
  sourcePath: string;
  destPath: string;
  sourceDriverId: string;
  destDriverId: string;
  fileName: string;
  fileSize: number;
  bytesTransferred: number;
  status: 'success' | 'failed' | 'skipped';
  error?: string;
  duration?: number; // ms
}

/** Information about a single file to be transferred */
export interface TransferFileInfo {
  sourcePath: string;
  destPath: string;
  fileName: string;
  fileSize: number;
  isDir: boolean;
}

/** A running / completed transfer task */
export interface TransferTask {
  id: string;
  status: TransferStatus;
  operation: TransferOperation;
  sourceDriverId: string;
  destDriverId: string;
  sourcePath: string;
  destPath: string;
  files: TransferFileInfo[];
  totalFiles: number;
  totalBytes: number;
  processedFiles: number;
  succeededFiles: number;
  failedFiles: number;
  skippedFiles: number;
  transferredBytes: number;
  currentFile: string | null;
  speed: number; // bytes per second
  progress: number; // 0-100
  startedAt: number | null;
  completedAt: number | null;
  results: FileTransferResult[];
  errors: Array<{ file: string; message: string; timestamp: number }>;
  abortController: AbortController | null;
}

// ---------------------------------------------------------------------------
// In-memory task store (survives HMR in dev)
// ---------------------------------------------------------------------------

const globalForTransferEngine = globalThis as unknown as {
  __transferEngineTasks: Map<string, TransferTask> | undefined;
};

function getTaskStore(): Map<string, TransferTask> {
  if (!globalForTransferEngine.__transferEngineTasks) {
    globalForTransferEngine.__transferEngineTasks = new Map();
  }
  return globalForTransferEngine.__transferEngineTasks;
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/** Retrieve a single transfer task by ID */
export function getTransferTask(taskId: string): TransferTask | undefined {
  return getTaskStore().get(taskId);
}

/** Retrieve all transfer tasks */
export function getAllTransferTasks(): TransferTask[] {
  return Array.from(getTaskStore().values());
}

/** Cancel a running / pending transfer task */
export function cancelTransferTask(taskId: string): boolean {
  const task = getTaskStore().get(taskId);
  if (!task) return false;
  if (task.status !== 'running' && task.status !== 'pending') return false;

  task.status = 'cancelled';
  if (task.abortController) {
    task.abortController.abort();
  }
  task.completedAt = Date.now();
  return true;
}

// ---------------------------------------------------------------------------
// Driver resolution
// ---------------------------------------------------------------------------

async function getDriverById(
  driverId: string,
): Promise<{ driver: StorageDriver; config: StorageDriverConfig }> {
  if (driverId === 'local-default') {
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

  const driverRecord = await db.storageDriver.findUnique({
    where: { id: driverId },
  });
  if (!driverRecord) throw new Error(`Driver not found: ${driverId}`);

  const config: StorageDriverConfig = {
    id: driverRecord.id,
    name: driverRecord.name,
    type: driverRecord.type as StorageDriverConfig['type'],
    config: JSON.parse(driverRecord.config || '{}'),
    isDefault: driverRecord.isDefault,
    isEnabled: driverRecord.isEnabled,
    createdAt: driverRecord.createdAt,
    updatedAt: driverRecord.updatedAt,
    authType: driverRecord.authType as StorageDriverConfig['authType'],
    authStatus: driverRecord.authStatus as StorageDriverConfig['authStatus'],
    accessToken: driverRecord.accessToken || undefined,
    refreshToken: driverRecord.refreshToken || undefined,
    tokenExpiresAt: driverRecord.tokenExpiresAt || undefined,
  };

  return { driver: await getDriver(config), config };
}

// ---------------------------------------------------------------------------
// Start a transfer
// ---------------------------------------------------------------------------

export interface StartTransferParams {
  sourceDriverId: string;
  destDriverId: string;
  sourcePath: string;
  destPath: string;
  operation: TransferOperation;
  files: TransferFileInfo[];
}

export async function startTransfer(
  params: StartTransferParams,
): Promise<TransferTask> {
  const taskId = crypto.randomUUID();

  const task: TransferTask = {
    id: taskId,
    status: 'pending',
    operation: params.operation,
    sourceDriverId: params.sourceDriverId,
    destDriverId: params.destDriverId,
    sourcePath: params.sourcePath,
    destPath: params.destPath,
    files: params.files,
    totalFiles: params.files.length,
    totalBytes: params.files.reduce((sum, f) => sum + f.fileSize, 0),
    processedFiles: 0,
    succeededFiles: 0,
    failedFiles: 0,
    skippedFiles: 0,
    transferredBytes: 0,
    currentFile: null,
    speed: 0,
    progress: 0,
    startedAt: null,
    completedAt: null,
    results: [],
    errors: [],
    abortController: new AbortController(),
  };

  getTaskStore().set(taskId, task);

  // Start processing asynchronously (fire-and-forget)
  processTransfer(task).catch((err) => {
    task.status = 'failed';
    task.errors.push({
      file: 'system',
      message: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown'}`,
      timestamp: Date.now(),
    });
    task.completedAt = Date.now();
  });

  // Auto-cleanup after 1 hour
  setTimeout(() => {
    getTaskStore().delete(taskId);
  }, 3600000);

  return task;
}

// ---------------------------------------------------------------------------
// Core transfer processing
// ---------------------------------------------------------------------------

async function processTransfer(task: TransferTask): Promise<void> {
  task.status = 'running';
  task.startedAt = Date.now();

  const { driver: sourceDriver } = await getDriverById(task.sourceDriverId);
  const { driver: destDriver } = await getDriverById(task.destDriverId);

  for (const file of task.files) {
    // ---- Cancellation gate ----
    if (task.abortController?.signal.aborted) {
      task.status = 'cancelled';
      break;
    }

    task.currentFile = file.fileName;
    const fileStartTime = Date.now();

    try {
      if (file.isDir) {
        // ----- Directory: just create on destination -----
        await destDriver.createDir(file.destPath);
        task.succeededFiles++;
        task.results.push({
          sourcePath: file.sourcePath,
          destPath: file.destPath,
          sourceDriverId: task.sourceDriverId,
          destDriverId: task.destDriverId,
          fileName: file.fileName,
          fileSize: 0,
          bytesTransferred: 0,
          status: 'success',
          duration: Date.now() - fileStartTime,
        });
      } else {
        // ----- File: transfer data -----
        let bytesTransferred = 0;

        const useStreaming =
          sourceDriver.createReadStream && destDriver.createWriteStream;

        if (useStreaming) {
          // ---- Streaming path ----
          try {
            bytesTransferred = await streamingTransfer(
              sourceDriver,
              destDriver,
              file.sourcePath,
              file.destPath,
              task,
            );
          } catch {
            // Stream failed — fall back to buffer-based transfer
            const data = await sourceDriver.readFile(file.sourcePath);
            await destDriver.writeFile(file.destPath, data);
            bytesTransferred = data.byteLength;
            task.transferredBytes += bytesTransferred;
          }
        } else {
          // ---- Buffer-based path (no streaming support) ----
          const data = await sourceDriver.readFile(file.sourcePath);
          await destDriver.writeFile(file.destPath, data);
          bytesTransferred = data.byteLength;
          task.transferredBytes += bytesTransferred;
        }

        // For move operation, delete source after successful copy
        if (task.operation === 'move') {
          try {
            await sourceDriver.deleteFile(file.sourcePath);
          } catch {
            task.errors.push({
              file: file.fileName,
              message:
                'Warning: Could not delete source file after move',
              timestamp: Date.now(),
            });
          }
        }

        task.succeededFiles++;
        task.results.push({
          sourcePath: file.sourcePath,
          destPath: file.destPath,
          sourceDriverId: task.sourceDriverId,
          destDriverId: task.destDriverId,
          fileName: file.fileName,
          fileSize: file.fileSize,
          bytesTransferred,
          status: 'success',
          duration: Date.now() - fileStartTime,
        });
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown error';
      task.failedFiles++;
      task.errors.push({
        file: file.fileName,
        message: errorMessage,
        timestamp: Date.now(),
      });
      task.results.push({
        sourcePath: file.sourcePath,
        destPath: file.destPath,
        sourceDriverId: task.sourceDriverId,
        destDriverId: task.destDriverId,
        fileName: file.fileName,
        fileSize: file.fileSize,
        bytesTransferred: 0,
        status: 'failed',
        error: errorMessage,
        duration: Date.now() - fileStartTime,
      });
    }

    task.processedFiles++;
    task.progress =
      task.totalFiles > 0
        ? Math.round((task.processedFiles / task.totalFiles) * 100)
        : 100;

    // Update byte-level progress
    if (task.totalBytes > 0) {
      const byteProgress = Math.round(
        (task.transferredBytes / task.totalBytes) * 100,
      );
      // Use the more conservative of file-count vs byte progress
      task.progress = Math.min(task.progress, byteProgress) || task.progress;
    }
  }

  // ---- Determine final status ----
  if (task.status === 'cancelled') {
    // keep cancelled
  } else if (task.failedFiles === 0) {
    task.status = 'completed';
  } else if (task.succeededFiles === 0) {
    task.status = 'failed';
  } else {
    task.status = 'completed_with_errors';
  }

  task.completedAt = Date.now();
  task.currentFile = null;
}

// ---------------------------------------------------------------------------
// Streaming transfer helper
// ---------------------------------------------------------------------------

async function streamingTransfer(
  sourceDriver: StorageDriver,
  destDriver: StorageDriver,
  sourcePath: string,
  destPath: string,
  task: TransferTask,
): Promise<number> {
  const readStream = await sourceDriver.createReadStream!(sourcePath);
  const writeStream = await destDriver.createWriteStream!(destPath);

  return new Promise<number>((resolve, reject) => {
    let transferred = 0;
    const reader = readStream.getReader();
    const writer = writeStream.getWriter();

    const pump = async () => {
      try {
        while (true) {
          // ---- Cancellation gate inside pump ----
          if (task.abortController?.signal.aborted) {
            writer.abort();
            reader.cancel();
            resolve(transferred);
            return;
          }

          const { done, value } = await reader.read();
          if (done) break;

          await writer.write(value);
          transferred += value.byteLength;
          task.transferredBytes += value.byteLength;

          // Calculate speed
          const elapsed =
            (Date.now() - (task.startedAt || Date.now())) / 1000;
          task.speed = elapsed > 0 ? task.transferredBytes / elapsed : 0;
          task.progress =
            task.totalBytes > 0
              ? Math.round((task.transferredBytes / task.totalBytes) * 100)
              : 0;
        }

        await writer.close();
        resolve(transferred);
      } catch (err) {
        reject(err);
      }
    };

    pump();
  });
}

// ---------------------------------------------------------------------------
// VFS-aware convenience: resolve virtual paths and build file list
// ---------------------------------------------------------------------------

export interface VFSStartTransferParams {
  sourcePath: string;
  destPath: string;
  sourceDriverId: string;
  destDriverId: string;
  operation: TransferOperation;
  files?: TransferFileInfo[];
}

/**
 * Start a VFS-aware transfer.
 * If no explicit `files` list is provided the source directory will be listed
 * automatically via VFS resolution and every item becomes a transfer entry.
 */
export async function startVFSTransfer(
  params: VFSStartTransferParams,
): Promise<TransferTask> {
  let transferFiles: TransferFileInfo[] = params.files || [];

  if (transferFiles.length === 0) {
    const resolved = await resolveVirtualPath(params.sourcePath);
    if (!resolved) {
      throw new Error('Source path not found in VFS');
    }

    const items = await resolved.driver.listDir(resolved.realPath);
    transferFiles = items.map((item) => ({
      sourcePath: resolved.realPath + '/' + item.name,
      destPath: params.destPath + '/' + item.name,
      fileName: item.name,
      fileSize: item.size,
      isDir: item.isDir,
    }));
  }

  return startTransfer({
    sourceDriverId: params.sourceDriverId,
    destDriverId: params.destDriverId,
    sourcePath: params.sourcePath,
    destPath: params.destPath,
    operation: params.operation,
    files: transferFiles,
  });
}
