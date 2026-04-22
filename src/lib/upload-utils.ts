import { toast } from "sonner";
import type { QueryClient } from "@tanstack/react-query";
import { useFileStore } from "@/store/file-store";

/** Maximum single file size: 100 MB */
export const MAX_FILE_SIZE = 100 * 1024 * 1024;

/** Maximum total storage: 10 GB */
export const MAX_TOTAL_STORAGE = 10 * 1024 * 1024 * 1024;

/**
 * Validate that a file does not exceed the maximum allowed size.
 * Returns an object with `valid` flag and optional error message.
 */
export function validateFileSize(file: File): { valid: boolean; message?: string } {
  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      message: `File "${file.name}" (${sizeMB} MB) exceeds the 100 MB size limit`,
    };
  }
  return { valid: true };
}

/**
 * Upload a single file using XMLHttpRequest for real progress tracking.
 * Also updates the store's uploadProgress state for the overlay panel.
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

    // Create a unique ID for this upload in the store
    const uploadId = crypto.randomUUID();

    // Add to store uploadProgress
    const { addUploadProgress, updateUploadProgress, removeUploadProgress } = useFileStore.getState();
    addUploadProgress({
      id: uploadId,
      fileName: file.name,
      progress: 0,
      status: "uploading",
    });

    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("files", file);
    formData.append("parentId", parentId);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        // Update store progress
        updateUploadProgress(uploadId, percent);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        // Mark as done in store, then remove after a delay
        updateUploadProgress(uploadId, 100, "done");
        setTimeout(() => {
          removeUploadProgress(uploadId);
        }, 2000);

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
        toast.error(`Failed to upload ${file.name}`);
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => {
      updateUploadProgress(uploadId, 0, "error");
      setTimeout(() => {
        removeUploadProgress(uploadId);
      }, 3000);
      toast.error(`Failed to upload ${file.name}`);
      reject(new Error("Upload network error"));
    };

    xhr.open("POST", "/api/files/upload");
    xhr.send(formData);
  });
}

/**
 * Upload multiple files sequentially with real progress tracking.
 * Each file gets tracked in the store's uploadProgress state.
 * Files exceeding the size limit are skipped with an error toast.
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
