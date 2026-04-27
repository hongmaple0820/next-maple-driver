/**
 * Chunked Upload Utility
 *
 * Provides functions for chunked file uploads with progress tracking,
 * pause/resume support, auto-retry, and integration with the task store.
 */

import { useTaskStore, type Task, type ChunkInfo } from "@/store/task-store";
import { toast } from "sonner";
import type { QueryClient } from "@tanstack/react-query";

// ──────────────────────── Constants ────────────────────────

const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// ──────────────────────── Types ────────────────────────

interface ChunkedUploadOptions {
  file: File;
  parentId: string;
  queryClient: QueryClient;
  driverId?: string;
  chunkSize?: number;
  onProgress?: (progress: number, speed: number) => void;
  onComplete?: (result: unknown) => void;
  onError?: (error: string) => void;
}

interface ChunkedUploadSession {
  taskId: string;
  uploadId: string;
  file: File;
  totalChunks: number;
  chunkSize: number;
  parentId: string;
  driverId?: string;
  queryClient: QueryClient;
  aborted: boolean;
}

// ──────────────────────── Active Sessions ────────────────────────

const activeSessions = new Map<string, ChunkedUploadSession>();

// ──────────────────────── Core Functions ────────────────────────

/**
 * Initiate a chunked upload session.
 * This creates a task in the task store and returns a session object.
 */
export async function initiateChunkedUpload(
  options: ChunkedUploadOptions
): Promise<string> {
  const {
    file,
    parentId,
    queryClient,
    driverId,
    chunkSize = DEFAULT_CHUNK_SIZE,
    onProgress,
    onComplete,
    onError,
  } = options;

  const totalChunks = Math.ceil(file.size / chunkSize);

  // Initialize chunk info
  const chunks: ChunkInfo[] = Array.from({ length: totalChunks }, (_, i) => ({
    index: i,
    status: "pending",
    retries: 0,
  }));

  // Add task to store
  const taskId = useTaskStore.getState().addTask({
    type: "upload",
    status: "pending",
    progress: 0,
    fileName: file.name,
    fileSize: file.size,
    speed: 0,
    error: null,
    uploadId: null,
    totalChunks,
    uploadedChunks: 0,
    chunks,
    sourcePath: null,
    destPath: null,
    sourceDriverId: null,
    destDriverId: null,
    metadata: { parentId, driverId: driverId ?? null, chunkSize },
  });

  try {
    // Call API to initialize upload
    const response = await fetch("/api/files/upload/chunked", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        fileSize: file.size,
        parentId,
        driverId,
        chunkSize,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to initialize chunked upload");
    }

    const data = await response.json();
    const uploadId = data.uploadId;

    // Update task with uploadId
    useTaskStore.getState().updateTask(taskId, { uploadId });

    // Create session
    const session: ChunkedUploadSession = {
      taskId,
      uploadId,
      file,
      totalChunks,
      chunkSize,
      parentId,
      driverId,
      queryClient,
      aborted: false,
    };

    activeSessions.set(taskId, session);

    // Start uploading chunks
    await uploadChunksWithQueue(session, onProgress, onComplete, onError);

    return taskId;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    useTaskStore.getState().failTask(taskId, errorMsg);
    onError?.(errorMsg);
    toast.error(`Failed to start chunked upload: ${file.name}`);
    return taskId;
  }
}

/**
 * Upload all chunks with queue management and auto-retry.
 */
async function uploadChunksWithQueue(
  session: ChunkedUploadSession,
  onProgress?: (progress: number, speed: number) => void,
  onComplete?: (result: unknown) => void,
  onError?: (error: string) => void
): Promise<void> {
  const { taskId, uploadId, file, totalChunks, chunkSize } = session;

  // Wait for queue slot
  await waitForQueueSlot(taskId);

  // Mark task as running
  useTaskStore.getState().startTask(taskId);

  const startTime = Date.now();
  let uploadedBytes = 0;

  try {
    // Upload chunks sequentially
    for (let i = 0; i < totalChunks; i++) {
      if (session.aborted) {
        return;
      }

      // Check if task was paused
      await waitForResume(taskId, session);

      // Get the current task state
      const task = useTaskStore.getState().getTaskById(taskId);
      if (!task || task.status === "cancelled") {
        return;
      }

      // Skip already uploaded chunks (for resume)
      if (task.chunks[i]?.status === "done") {
        uploadedBytes += Math.min(chunkSize, file.size - i * chunkSize);
        continue;
      }

      // Update chunk status
      useTaskStore.getState().updateChunkStatus(taskId, i, "uploading");

      // Extract chunk
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunkBlob = file.slice(start, end);

      // Upload with retry
      let success = false;
      let lastError = "";

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        if (session.aborted) return;

        try {
          const formData = new FormData();
          formData.append("uploadId", uploadId);
          formData.append("chunkIndex", i.toString());
          formData.append("chunk", chunkBlob);

          const response = await fetch("/api/files/upload/chunked", {
            method: "PUT",
            body: formData,
            signal: useTaskStore.getState().getTaskById(taskId)?.abortController?.signal,
          });

          if (response.ok) {
            success = true;
            break;
          }

          const errorData = await response.json();
          lastError = errorData.error || `Chunk upload failed (status ${response.status})`;
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") {
            return; // Cancelled
          }
          lastError = err instanceof Error ? err.message : "Network error";
        }

        // Wait before retry
        if (attempt < MAX_RETRIES - 1) {
          await sleep(RETRY_DELAY_MS * (attempt + 1));
        }
      }

      if (!success) {
        useTaskStore.getState().updateChunkStatus(taskId, i, "failed");
        throw new Error(`Chunk ${i} failed after ${MAX_RETRIES} retries: ${lastError}`);
      }

      // Chunk uploaded successfully
      useTaskStore.getState().updateChunkStatus(taskId, i, "done");
      uploadedBytes += end - start;

      // Update progress and speed
      const elapsedSeconds = (Date.now() - startTime) / 1000;
      const speed = elapsedSeconds > 0 ? Math.round(uploadedBytes / elapsedSeconds) : 0;
      const progress = Math.round((uploadedBytes / file.size) * 100);

      useTaskStore.getState().updateProgress(taskId, progress, speed);
      onProgress?.(progress, speed);
    }

    // All chunks uploaded — complete the upload
    await completeChunkedUpload(session);

    // Mark task as completed
    useTaskStore.getState().completeTask(taskId);

    // Invalidate queries
    session.queryClient.invalidateQueries({ queryKey: ["files"] });
    session.queryClient.invalidateQueries({ queryKey: ["storage-stats"] });

    // Add activity log entry
    try {
      const { addActivity } = useFileStore.getState();
      addActivity({ action: "upload", fileName: file.name });
    } catch { /* non-critical */ }

    toast.success(`${file.name} uploaded successfully`);
    onComplete?.(null);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";

    // Only fail if not aborted/paused
    const task = useTaskStore.getState().getTaskById(taskId);
    if (task && task.status !== "paused" && task.status !== "cancelled") {
      useTaskStore.getState().failTask(taskId, errorMsg);
      onError?.(errorMsg);
      toast.error(`Upload failed: ${file.name}`);
    }
  } finally {
    activeSessions.delete(taskId);
  }
}

/**
 * Complete a chunked upload by merging all chunks.
 */
async function completeChunkedUpload(session: ChunkedUploadSession): Promise<void> {
  const { uploadId } = session;

  const response = await fetch("/api/files/upload/chunked", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uploadId }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to complete chunked upload");
  }

  return;
}

/**
 * Pause a chunked upload.
 */
export function pauseChunkedUpload(taskId: string): void {
  const session = activeSessions.get(taskId);
  if (session) {
    session.aborted = true;
  }
  useTaskStore.getState().pauseTask(taskId);
}

/**
 * Resume a chunked upload.
 */
export async function resumeChunkedUpload(
  taskId: string,
  queryClient: QueryClient
): Promise<void> {
  const task = useTaskStore.getState().getTaskById(taskId);
  if (!task || task.type !== "upload" || !task.uploadId) {
    toast.error("Cannot resume this task");
    return;
  }

  // Check upload status from server
  try {
    const response = await fetch(`/api/files/upload/chunked?uploadId=${task.uploadId}`);
    if (response.ok) {
      const data = await response.json();

      // Update chunk statuses based on server state
      const uploadedIndices = new Set(data.uploadedChunks as number[]);
      const updatedChunks: ChunkInfo[] = task.chunks.map((c) => ({
        ...c,
        status: uploadedIndices.has(c.index) ? ("done" as const) : ("pending" as const),
      }));

      useTaskStore.getState().updateTask(taskId, {
        chunks: updatedChunks,
        uploadedChunks: uploadedIndices.size,
        progress: data.progress ?? task.progress,
      });
    }
  } catch {
    // If we can't check server state, just resume with current state
  }

  // Mark as pending in store
  useTaskStore.getState().resumeTask(taskId);

  // Re-create the session and continue uploading
  const metadata = task.metadata as { parentId?: string; driverId?: string; chunkSize?: number };
  const parentId = metadata?.parentId || "root";
  const driverId = metadata?.driverId;
  const chunkSize = metadata?.chunkSize || DEFAULT_CHUNK_SIZE;

  // We need the original File object — check if we have it
  const existingSession = activeSessions.get(taskId);
  if (existingSession) {
    existingSession.aborted = false;
    return;
  }

  // If we don't have the file object, we can't resume
  // The user would need to re-select the file
  toast.error("Cannot resume: original file reference lost. Please re-upload.");
}

/**
 * Cancel a chunked upload.
 */
export function cancelChunkedUpload(taskId: string): void {
  const session = activeSessions.get(taskId);
  if (session) {
    session.aborted = true;
  }
  useTaskStore.getState().cancelTask(taskId);

  // Also cancel on server side if there's an uploadId
  const task = useTaskStore.getState().getTaskById(taskId);
  if (task?.uploadId) {
    fetch(`/api/tasks?id=${taskId}`, { method: "DELETE" }).catch(() => {
      // Non-critical
    });
  }

  activeSessions.delete(taskId);
}

/**
 * Retry a failed chunked upload.
 */
export async function retryChunkedUpload(
  taskId: string,
  file: File,
  queryClient: QueryClient
): Promise<void> {
  const task = useTaskStore.getState().getTaskById(taskId);
  if (!task || task.type !== "upload") {
    toast.error("Cannot retry this task");
    return;
  }

  // First check server state for already uploaded chunks
  if (task.uploadId) {
    try {
      const response = await fetch(`/api/files/upload/chunked?uploadId=${task.uploadId}`);
      if (response.ok) {
        const data = await response.json();
        const uploadedIndices = new Set(data.uploadedChunks as number[]);
        const updatedChunks: ChunkInfo[] = task.chunks.map((c) => ({
          ...c,
          status: uploadedIndices.has(c.index) ? ("done" as const) : ("pending" as const),
          retries: uploadedIndices.has(c.index) ? c.retries : 0,
        }));

        useTaskStore.getState().updateTask(taskId, {
          chunks: updatedChunks,
          uploadedChunks: uploadedIndices.size,
          progress: data.progress ?? 0,
        });
      }
    } catch {
      // If we can't check server state, just retry from current state
    }
  }

  // Mark as pending
  useTaskStore.getState().retryTask(taskId);

  // Create new session
  const metadata = task.metadata as { parentId?: string; driverId?: string; chunkSize?: number };
  const parentId = metadata?.parentId || "root";
  const driverId = metadata?.driverId;
  const chunkSize = metadata?.chunkSize || DEFAULT_CHUNK_SIZE;

  const session: ChunkedUploadSession = {
    taskId,
    uploadId: task.uploadId || "",
    file,
    totalChunks: task.totalChunks,
    chunkSize,
    parentId,
    driverId,
    queryClient,
    aborted: false,
  };

  if (!task.uploadId) {
    // Need to re-initialize upload session
    try {
      const response = await fetch("/api/files/upload/chunked", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          parentId,
          driverId,
          chunkSize,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to re-initialize chunked upload");
      }

      const data = await response.json();
      session.uploadId = data.uploadId;
      useTaskStore.getState().updateTask(taskId, { uploadId: data.uploadId });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      useTaskStore.getState().failTask(taskId, errorMsg);
      toast.error(`Failed to retry upload: ${file.name}`);
      return;
    }
  }

  activeSessions.set(taskId, session);

  // Start uploading remaining chunks
  await uploadChunksWithQueue(session);
}

// ──────────────────────── Multi-file Upload with Queue ────────────────────────

/**
 * Upload multiple files concurrently with queue management.
 * Respects the max concurrent task limit from the task store.
 */
export async function uploadMultipleFilesChunked(
  files: File[],
  parentId: string,
  queryClient: QueryClient,
  driverId?: string,
  chunkSize?: number
): Promise<string[]> {
  const taskIds: string[] = [];

  for (const file of files) {
    // For small files (< chunk size), use regular upload
    if (file.size < (chunkSize || DEFAULT_CHUNK_SIZE)) {
      // Use regular upload for small files
      const taskId = useTaskStore.getState().addTask({
        type: "upload",
        status: "pending",
        progress: 0,
        fileName: file.name,
        fileSize: file.size,
        speed: 0,
        error: null,
        uploadId: null,
        totalChunks: 0,
        uploadedChunks: 0,
        chunks: [],
        sourcePath: null,
        destPath: null,
        sourceDriverId: null,
        destDriverId: null,
        metadata: { parentId, driverId, isSmallFile: true },
      });

      taskIds.push(taskId);

      // Use the existing upload utility for small files
      import("@/lib/upload-utils").then(({ uploadFileWithProgress }) => {
        uploadFileWithProgress(file, parentId, queryClient).then(() => {
          useTaskStore.getState().completeTask(taskId);
        }).catch((err) => {
          useTaskStore.getState().failTask(taskId, err.message);
        });
      });
    } else {
      // Use chunked upload for large files
      const taskId = await initiateChunkedUpload({
        file,
        parentId,
        queryClient,
        driverId,
        chunkSize,
      });
      taskIds.push(taskId);
    }
  }

  return taskIds;
}

// ──────────────────────── Helpers ────────────────────────

/**
 * Wait until there's a queue slot available.
 */
function waitForQueueSlot(taskId: string): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      const store = useTaskStore.getState();
      const task = store.getTaskById(taskId);

      // Task was cancelled while waiting
      if (!task || task.status === "cancelled") {
        resolve();
        return;
      }

      if (store.canStartMore()) {
        resolve();
        return;
      }

      // Check again in 500ms
      setTimeout(check, 500);
    };

    check();
  });
}

/**
 * Wait while task is paused.
 */
function waitForResume(taskId: string, session: ChunkedUploadSession): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      if (session.aborted) {
        resolve();
        return;
      }

      const task = useTaskStore.getState().getTaskById(taskId);
      if (!task || task.status === "cancelled") {
        resolve();
        return;
      }

      if (task.status === "paused") {
        setTimeout(check, 500);
        return;
      }

      resolve();
    };

    check();
  });
}

/**
 * Sleep utility.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
