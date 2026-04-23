/**
 * Shared types and utilities for the cross-driver file transfer API.
 * These are used by the main route, task status route, and info route.
 */

/** Status of a cross-driver transfer task */
export type TransferTaskStatus = 'pending' | 'in_progress' | 'completed' | 'completed_with_errors' | 'failed' | 'cancelled';

/** Operation mode for cross-driver transfer */
export type TransferMode = 'copy' | 'move';

/** Represents a single cross-driver transfer task tracked in memory */
export interface TransferTask {
  id: string;
  status: TransferTaskStatus;
  totalFiles: number;
  processedFiles: number;
  succeededFiles: number;
  failedFiles: number;
  totalBytes: number;
  transferredBytes: number;
  errors: TransferError[];
  startedAt: number;
  completedAt?: number;
  mode: TransferMode;
  sourceDriverId: string;
  targetDriverId: string;
  /** IDs of files that were requested for transfer */
  requestedFileIds: string[];
  /** Map of file ID → result for detailed tracking */
  fileResults: Map<string, FileTransferResult>;
}

/** Result of transferring a single file */
export interface FileTransferResult {
  fileId: string;
  fileName: string;
  status: 'success' | 'failed' | 'skipped';
  bytesTransferred: number;
  error?: string;
}

/** Structured error entry for transfer tasks */
export interface TransferError {
  fileId?: string;
  fileName?: string;
  message: string;
  timestamp: number;
}

/** Request body for POST /api/files/cross-driver-transfer */
export interface CrossDriverTransferRequest {
  fileIds: string[];
  targetDriverId: string;
  targetFolderId?: string;
  targetParentId?: string;
  operation?: TransferMode;
  mode?: TransferMode;
}

/** Response for POST /api/files/cross-driver-transfer */
export interface CrossDriverTransferResponse {
  taskId: string;
  status: TransferTaskStatus;
  totalFiles: number;
  totalBytes: number;
  mode: TransferMode;
  sourceDriverId: string;
  targetDriverId: string;
}

/** Response for GET /api/files/cross-driver-transfer/[taskId] */
export interface TransferStatusResponse {
  taskId: string;
  status: TransferTaskStatus;
  progress: number;
  bytesProgress: number;
  totalFiles: number;
  processedFiles: number;
  succeededFiles: number;
  failedFiles: number;
  totalBytes: number;
  transferredBytes: number;
  errors: TransferError[];
  duration: number;
  mode: TransferMode;
  sourceDriverId: string;
  targetDriverId: string;
  fileResults?: Array<{
    fileId: string;
    fileName: string;
    status: 'success' | 'failed' | 'skipped';
    bytesTransferred: number;
    error?: string;
  }>;
}

/** File info item returned by the info endpoint */
export interface TransferFileInfo {
  id: string;
  name: string;
  type: string;
  size: number;
  driverId: string | null;
  driverName: string;
  mimeType: string;
}

// ---- Global transfer task store (survives HMR in dev) ----

const globalForTransferTasks = globalThis as unknown as {
  crossDriverTransferTasks: Map<string, TransferTask> | undefined;
};

/** Get the global transfer task map (creates one lazily) */
export function getTransferTasks(): Map<string, TransferTask> {
  if (!globalForTransferTasks.crossDriverTransferTasks) {
    globalForTransferTasks.crossDriverTransferTasks = new Map();
  }
  return globalForTransferTasks.crossDriverTransferTasks;
}

// ---- Driver ID helpers ----

/**
 * Check if a driver ID refers to the default local driver.
 * null, undefined, "local-default", and "default-local" are all treated as local default.
 */
export function isLocalDefault(driverId: string | null | undefined): boolean {
  return !driverId || driverId === 'local-default' || driverId === 'default-local';
}

/**
 * Normalize a driver ID for storage in the database.
 * Local default driver → null (so DB default applies).
 */
export function resolveDriverIdForDb(driverId: string): string | null {
  return isLocalDefault(driverId) ? null : driverId;
}

/**
 * Normalize a driver ID for comparison purposes.
 * All local-default variants → "local-default".
 */
export function normalizeDriverId(driverId: string | null | undefined): string {
  return isLocalDefault(driverId) ? 'local-default' : driverId!;
}
