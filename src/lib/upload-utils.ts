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

    const toastId = `upload-${Date.now()}-${file.name}`;

    toast.loading(`Uploading ${file.name}...`, {
      id: toastId,
      description: "0%",
    });

    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("files", file);
    formData.append("parentId", parentId);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        toast.loading(`Uploading ${file.name}...`, {
          id: toastId,
          description: `${percent}%`,
        });
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        toast.success(`${file.name} uploaded`, { id: toastId });
        queryClient.invalidateQueries({ queryKey: ["files"] });
        queryClient.invalidateQueries({ queryKey: ["storage-stats"] });
        // Add activity log entry
        try {
          const { addActivity } = useFileStore.getState();
          addActivity({ action: "upload", fileName: file.name });
        } catch { /* non-critical */ }
        resolve();
      } else {
        toast.error(`Failed to upload ${file.name}`, { id: toastId });
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => {
      toast.error(`Failed to upload ${file.name}`, { id: toastId });
      reject(new Error("Upload network error"));
    };

    xhr.open("POST", "/api/files/upload");
    xhr.send(formData);
  });
}

/**
 * Upload multiple files sequentially with real progress tracking.
 * Each file gets its own toast with progress percentage.
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

  for (const file of validFiles) {
    try {
      await uploadFileWithProgress(file, parentId, queryClient);
    } catch {
      // Error already shown via toast, continue with next file
    }
  }
}
