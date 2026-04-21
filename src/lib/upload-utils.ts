import { toast } from "sonner";
import type { QueryClient } from "@tanstack/react-query";
import { useFileStore } from "@/store/file-store";

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
 */
export async function uploadFilesWithProgress(
  files: FileList | File[],
  parentId: string,
  queryClient: QueryClient,
): Promise<void> {
  const fileArray = Array.from(files);
  for (const file of fileArray) {
    try {
      await uploadFileWithProgress(file, parentId, queryClient);
    } catch {
      // Error already shown via toast, continue with next file
    }
  }
}
