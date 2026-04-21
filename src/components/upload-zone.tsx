"use client";

import { useCallback, useState, useRef } from "react";
import { Upload, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useFileStore } from "@/store/file-store";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export function UploadZone({ children }: { children: React.ReactNode }) {
  const { currentFolderId, uploadProgress, addUploadProgress, updateUploadProgress, removeUploadProgress } = useFileStore();
  const queryClient = useQueryClient();

  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      for (const file of fileArray) {
        const uploadId = `${Date.now()}-${file.name}`;
        addUploadProgress({
          id: uploadId,
          fileName: file.name,
          progress: 0,
          status: "uploading",
        });

        const formData = new FormData();
        formData.append("files", file);
        formData.append("parentId", currentFolderId);

        try {
          // Simulate progress for visual feedback
          let progress = 0;
          const interval = setInterval(() => {
            progress = Math.min(progress + Math.random() * 20, 90);
            updateUploadProgress(uploadId, progress);
          }, 200);

          const res = await fetch("/api/files/upload", {
            method: "POST",
            body: formData,
          });

          clearInterval(interval);

          if (res.ok) {
            updateUploadProgress(uploadId, 100, "done");
            queryClient.invalidateQueries({ queryKey: ["files"] });
            queryClient.invalidateQueries({ queryKey: ["storage-stats"] });
            setTimeout(() => removeUploadProgress(uploadId), 2000);
          } else {
            updateUploadProgress(uploadId, 0, "error");
            setTimeout(() => removeUploadProgress(uploadId), 3000);
          }
        } catch {
          updateUploadProgress(uploadId, 0, "error");
          setTimeout(() => removeUploadProgress(uploadId), 3000);
        }
      }
    },
    [currentFolderId, addUploadProgress, updateUploadProgress, removeUploadProgress, queryClient]
  );

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current += 1;
      if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        setIsDragging(true);
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
      }
    },
    []
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounterRef.current = 0;

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        uploadFiles(e.dataTransfer.files);
      }
    },
    [uploadFiles]
  );

  return (
    <div
      className="relative flex-1 min-h-0"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}

      {/* Drag overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-emerald-500/5 border-2 border-dashed border-emerald-500 rounded-lg backdrop-blur-sm"
          >
            <div className="flex flex-col items-center gap-3 p-8 rounded-xl bg-background/90 shadow-lg border">
              <Upload className="w-12 h-12 text-emerald-600" />
              <p className="text-lg font-semibold">Drop files to upload</p>
              <p className="text-sm text-muted-foreground">
                Files will be uploaded to the current folder
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload progress toast */}
      <AnimatePresence>
        {uploadProgress.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-4 right-4 z-50 w-80 space-y-2"
          >
            {uploadProgress.map((upload) => (
              <motion.div
                key={upload.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="bg-background border rounded-lg shadow-lg p-3"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium truncate max-w-[200px]">
                    {upload.fileName}
                  </span>
                  <div className="flex items-center gap-1">
                    {upload.status === "done" && (
                      <span className="text-xs text-emerald-600 font-medium">Done</span>
                    )}
                    {upload.status === "error" && (
                      <span className="text-xs text-destructive font-medium">Error</span>
                    )}
                    <button
                      onClick={() => removeUploadProgress(upload.id)}
                      className="p-0.5 rounded hover:bg-muted"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <Progress
                  value={upload.progress}
                  className={cn(
                    "h-1.5",
                    upload.status === "done" && "[&>div]:bg-emerald-500",
                    upload.status === "error" && "[&>div]:bg-destructive"
                  )}
                />
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
