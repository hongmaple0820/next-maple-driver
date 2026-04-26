"use client";

import { useCallback, useState, useRef } from "react";
import { CloudUpload } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useFileStore } from "@/store/file-store";
import { uploadFilesWithProgress, uploadFileWithProgress, MAX_FILE_SIZE, MAX_TOTAL_STORAGE } from "@/lib/upload-utils";
import { formatFileSize, type StorageStats } from "@/lib/file-utils";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";

/**
 * Recursively traverse a FileSystemEntry to collect all File objects.
 * Preserves folder structure by uploading files with webkitRelativePath intact.
 */
async function traverseEntry(
  entry: FileSystemEntry,
  path: string = "",
): Promise<File[]> {
  if (entry.isFile) {
    return new Promise<File[]>((resolve) => {
      (entry as FileSystemFileEntry).file((file) => {
        // Create a new File with the relative path baked in
        const relativePath = path ? `${path}/${file.name}` : file.name;
        const newFile = new File([file], file.name, { type: file.type });
        // Attach the webkitRelativePath via Object.defineProperty for compatibility
        Object.defineProperty(newFile, "webkitRelativePath", {
          value: relativePath,
          writable: false,
        });
        resolve([newFile]);
      }, () => resolve([]));
    });
  } else if (entry.isDirectory) {
    const dirReader = (entry as FileSystemDirectoryEntry).createReader();
    const entries = await new Promise<FileSystemEntry[]>((resolve) => {
      const allEntries: FileSystemEntry[] = [];
      const readBatch = () => {
        dirReader.readEntries((batch) => {
          if (batch.length === 0) {
            resolve(allEntries);
          } else {
            allEntries.push(...batch);
            readBatch();
          }
        }, () => resolve(allEntries));
      };
      readBatch();
    });

    const newPath = path ? `${path}/${entry.name}` : entry.name;
    const files: File[] = [];
    for (const childEntry of entries) {
      const childFiles = await traverseEntry(childEntry, newPath);
      files.push(...childFiles);
    }
    return files;
  }
  return [];
}

/**
 * Extract files from a DataTransfer using webkitGetAsEntry for folder support.
 */
async function extractFilesFromDataTransfer(
  dataTransfer: DataTransfer,
): Promise<{ files: File[]; hasFolder: boolean }> {
  const items = dataTransfer.items;
  const allFiles: File[] = [];
  let hasFolder = false;

  if (items && items.length > 0) {
    // Use webkitGetAsEntry for folder support
    const entries: FileSystemEntry[] = [];
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry?.();
      if (entry) {
        if (entry.isDirectory) hasFolder = true;
        entries.push(entry);
      }
    }

    if (entries.length > 0) {
      for (const entry of entries) {
        const files = await traverseEntry(entry);
        allFiles.push(...files);
      }
      return { files: allFiles, hasFolder };
    }
  }

  // Fallback to regular file list if webkitGetAsEntry is not available
  const files = dataTransfer.files ? Array.from(dataTransfer.files) : [];
  return { files, hasFolder: false };
}

export function UploadZone({ children }: { children: React.ReactNode }) {
  const { currentFolderId } = useFileStore();
  const queryClient = useQueryClient();
  const { t } = useI18n();

  const [isDragging, setIsDragging] = useState(false);
  const [isFolderDrag, setIsFolderDrag] = useState(false);
  const dragCounterRef = useRef(0);

  // Fetch storage stats for remaining storage display
  const { data: stats } = useQuery<StorageStats>({
    queryKey: ["storage-stats"],
    queryFn: async () => {
      const res = await fetch("/api/files/stats");
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      await uploadFilesWithProgress(files, currentFolderId, queryClient);
    },
    [currentFolderId, queryClient]
  );

  const uploadFolderFiles = useCallback(
    async (files: File[]) => {
      // For folder uploads, we need to preserve the folder structure
      // Build paths mapping from webkitRelativePath
      const paths: Record<string, string> = {};
      files.forEach((file, idx) => {
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
        if (relativePath) {
          paths[idx] = relativePath;
        }
      });

      // Separate large files (>= 5MB) from small files
      const CHUNKED_THRESHOLD = 5 * 1024 * 1024;
      const largeFiles = files.filter(f => f.size >= CHUNKED_THRESHOLD);
      const smallFiles = files.filter(f => f.size < CHUNKED_THRESHOLD);

      // Upload small files via batch XHR with paths
      if (smallFiles.length > 0) {
        const formData = new FormData();
        smallFiles.forEach((file) => {
          formData.append("files", file);
        });
        formData.append("parentId", currentFolderId);
        if (Object.keys(paths).length > 0) {
          // Re-map paths for small files only
          const smallPaths: Record<string, string> = {};
          smallFiles.forEach((file, idx) => {
            const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
            if (relativePath) {
              smallPaths[idx] = relativePath;
            }
          });
          if (Object.keys(smallPaths).length > 0) {
            formData.append("paths", JSON.stringify(smallPaths));
          }
        }

        try {
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            const uploadId = crypto.randomUUID();
            const { addUploadProgress, updateUploadProgress, removeUploadProgress } = useFileStore.getState();

            addUploadProgress({
              id: uploadId,
              fileName: smallFiles.length === 1 ? smallFiles[0].name : `${smallFiles.length} files`,
              progress: 0,
              status: "uploading",
            });

            xhr.upload.onprogress = (ev) => {
              if (ev.lengthComputable) {
                const percent = Math.round((ev.loaded / ev.total) * 100);
                updateUploadProgress(uploadId, percent);
              }
            };

            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                updateUploadProgress(uploadId, 100, "done");
                setTimeout(() => removeUploadProgress(uploadId), 2000);
                queryClient.invalidateQueries({ queryKey: ["files"] });
                queryClient.invalidateQueries({ queryKey: ["storage-stats"] });
                resolve();
              } else {
                updateUploadProgress(uploadId, 0, "error");
                setTimeout(() => removeUploadProgress(uploadId), 3000);
                reject(new Error("Upload failed"));
              }
            };

            xhr.onerror = () => {
              updateUploadProgress(uploadId, 0, "error");
              setTimeout(() => removeUploadProgress(uploadId), 3000);
              reject(new Error("Upload network error"));
            };

            xhr.open("POST", "/api/files/upload");
            xhr.send(formData);
          });
        } catch {
          toast.error("Folder upload failed for small files");
        }
      }

      // Upload large files individually with chunked upload
      for (const file of largeFiles) {
        try {
          await uploadFileWithProgress(file, currentFolderId, queryClient);
        } catch {
          // Error already shown via toast
        }
      }

      if (files.length > 0) {
        toast.success(`${files.length} files uploaded from folder`);
      }
    },
    [currentFolderId, queryClient]
  );

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current += 1;
      if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        setIsDragging(true);
        // Check if any dragged item is a folder
        let folderDetected = false;
        for (let i = 0; i < e.dataTransfer.items.length; i++) {
          const entry = e.dataTransfer.items[i].webkitGetAsEntry?.();
          if (entry?.isDirectory) {
            folderDetected = true;
            break;
          }
        }
        setIsFolderDrag(folderDetected);
      }
    },
    []
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current -= 1;
      if (dragCounterRef.current === 0) {
        setIsDragging(false);
        setIsFolderDrag(false);
      }
    },
    []
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      setIsFolderDrag(false);
      dragCounterRef.current = 0;

      const { files, hasFolder } = await extractFilesFromDataTransfer(e.dataTransfer);

      if (files.length === 0) return;

      if (hasFolder) {
        // Folder drag-and-drop: use folder upload with path preservation
        await uploadFolderFiles(files);
      } else {
        // Regular file drop
        await uploadFiles(files);
      }
    },
    [uploadFiles, uploadFolderFiles]
  );

  const remainingBytes = stats ? Math.max(0, stats.totalBytes - stats.usedBytes) : MAX_TOTAL_STORAGE;
  const remainingGB = (remainingBytes / (1024 * 1024 * 1024)).toFixed(1);

  return (
    <div
      className="relative flex-1 min-h-0 flex flex-col"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="flex-1 min-h-0">
        {children}
      </div>

      {/* Drag overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-emerald-500/5 border-[3px] border-dashed border-emerald-400/50 rounded-lg backdrop-blur-[2px] animate-drag-pulse"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              className="flex flex-col items-center gap-4 p-10 rounded-2xl bg-background/95 shadow-2xl border border-emerald-200/50 dark:border-emerald-800/50"
            >
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center animate-pulse">
                <CloudUpload className="w-8 h-8 text-emerald-600" />
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold">
                  {isFolderDrag ? "Drop folder to upload" : "Drop files to upload"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {isFolderDrag
                    ? "Folder structure will be preserved"
                    : "Files will be uploaded to the current folder"}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Max {formatFileSize(MAX_FILE_SIZE)} per file · {remainingGB} GB available
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Storage hint at the bottom */}
      {!isDragging && stats && (
        <div className="flex items-center justify-center py-1.5 px-4 border-t border-border/30">
          <p className="text-xs text-muted-foreground">
            {remainingGB} GB available · Max {formatFileSize(MAX_FILE_SIZE)} per file
          </p>
        </div>
      )}
    </div>
  );
}
