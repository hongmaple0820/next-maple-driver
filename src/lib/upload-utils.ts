import { toast } from "sonner";
import type { QueryClient } from "@tanstack/react-query";
import { useFileStore } from "@/store/file-store";
import { useTaskStore } from "@/store/task-store";
import { initiateChunkedUpload } from "@/lib/chunked-upload";

/** Maximum single file size: 500 MB */
export const MAX_FILE_SIZE = 500 * 1024 * 1024;

/** Maximum total storage: 10 GB */
export const MAX_TOTAL_STORAGE = 10 * 1024 * 1024 * 1024;

/** Chunked upload threshold: 5 MB */
const CHUNKED_UPLOAD_THRESHOLD = 5 * 1024 * 1024;

/**
 * Validate that a file does not exceed the maximum allowed size.
 * Returns an object with `valid` flag and optional error message.
 */
export function validateFileSize(file: File): { valid: boolean; message?: string } {
  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      message: `File "${file.name}" (${sizeMB} MB) exceeds the 500 MB size limit`,
    };
  }
  return { valid: true };
}

/**
 * Upload a single file using XMLHttpRequest for real progress tracking.
 * Also updates the store's uploadProgress state for the overlay panel
 * AND creates a task entry in the task store.
 *
 * For files >= 5MB, automatically uses chunked upload.
 * For files < 5MB, uses the existing XHR upload.
 *
 * Returns a Promise that resolves when the upload is complete.
 */
export function uploadFileWithProgress(
  file: File,
  parentId: string,
  queryClient: QueryClient,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Validate file size before starting upload
    const validation = validateFileSize(file);
    if (!validation.valid) {
      toast.error(validation.message!);
      reject(new Error(validation.message));
      return;
    }

    // For large files (>= 5MB), use chunked upload
    if (file.size >= CHUNKED_UPLOAD_THRESHOLD) {
      initiateChunkedUpload({
        file,
        parentId,
        queryClient,
        onProgress: (_progress, _speed) => {
          // Progress is tracked in task store by initiateChunkedUpload
        },
        onComplete: () => {
          resolve();
        },
        onError: (error) => {
          reject(new Error(error));
        },
      }).then(() => {
        // initiateChunkedUpload resolves with taskId after completion
        resolve();
      }).catch((err) => {
        reject(err);
      });
      return;
    }

    // For small files (< 5MB), use regular XHR upload with task store integration
    const uploadId = crypto.randomUUID();

    // Add to file store uploadProgress (backward compatibility)
    const { addUploadProgress, updateUploadProgress, removeUploadProgress } = useFileStore.getState();
    addUploadProgress({
      id: uploadId,
      fileName: file.name,
      progress: 0,
      status: "uploading",
    });

    // Create task entry in task store
    const taskId = useTaskStore.getState().addTask({
      type: "upload",
      status: "running",
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
      metadata: { parentId },
    });

    const startTime = Date.now();

    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("files", file);
    formData.append("parentId", parentId);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        // Update file store progress (backward compatibility)
        updateUploadProgress(uploadId, percent);

        // Update task store progress
        const elapsedSeconds = (Date.now() - startTime) / 1000;
        const speed = elapsedSeconds > 0 ? Math.round(e.loaded / elapsedSeconds) : 0;
        useTaskStore.getState().updateProgress(taskId, percent, speed);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        // Mark as done in file store, then remove after a delay
        updateUploadProgress(uploadId, 100, "done");
        setTimeout(() => {
          removeUploadProgress(uploadId);
        }, 2000);

        // Mark task as completed in task store
        useTaskStore.getState().completeTask(taskId);

        queryClient.invalidateQueries({ queryKey: ["files"] });
        queryClient.invalidateQueries({ queryKey: ["storage-stats"] });
        // Add activity log entry
        try {
          const { addActivity } = useFileStore.getState();
          addActivity({ action: "upload", fileName: file.name });
        } catch { /* non-critical */ }
        resolve();
      } else {
        updateUploadProgress(uploadId, 0, "error");
        setTimeout(() => {
          removeUploadProgress(uploadId);
        }, 3000);

        // Mark task as failed in task store
        useTaskStore.getState().failTask(taskId, `Upload failed with status ${xhr.status}`);

        toast.error(`Failed to upload ${file.name}`);
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => {
      updateUploadProgress(uploadId, 0, "error");
      setTimeout(() => {
        removeUploadProgress(uploadId);
      }, 3000);

      // Mark task as failed in task store
      useTaskStore.getState().failTask(taskId, "Upload network error");

      toast.error(`Failed to upload ${file.name}`);
      reject(new Error("Upload network error"));
    };

    xhr.open("POST", "/api/files/upload");
    xhr.send(formData);
  });
}

/**
 * Upload multiple files sequentially with real progress tracking.
 * Each file gets tracked in the store's uploadProgress state
 * AND in the task store.
 * Files exceeding the size limit are skipped with an error toast.
 * Files >= 5MB automatically use chunked upload.
 */
export async function uploadFilesWithProgress(
  files: FileList | File[],
  parentId: string,
  queryClient: QueryClient,
): Promise<void> {
  const fileArray = Array.from(files);

  // Pre-validate all files and show errors for oversized ones
  const validFiles = fileArray.filter((file) => {
    const validation = validateFileSize(file);
    if (!validation.valid) {
      toast.error(validation.message!);
      return false;
    }
    return true;
  });

  if (validFiles.length === 0) return;

  let successCount = 0;
  for (const file of validFiles) {
    try {
      await uploadFileWithProgress(file, parentId, queryClient);
      successCount++;
    } catch {
      // Error already shown via toast, continue with next file
    }
  }

  // Show summary toast if multiple files were uploaded
  if (validFiles.length > 1) {
    const failedCount = validFiles.length - successCount;
    if (failedCount === 0) {
      toast.success(`${successCount} files uploaded successfully`);
    } else {
      toast.warning(`${successCount} of ${validFiles.length} files uploaded`, {
        description: `${failedCount} file${failedCount > 1 ? "s" : ""} failed to upload`,
      });
    }
  }
}
