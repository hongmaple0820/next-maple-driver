"use client";

import { useCallback, useState, useRef } from "react";
import { CloudUpload } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useFileStore } from "@/store/file-store";
import { uploadFilesWithProgress, MAX_FILE_SIZE, MAX_TOTAL_STORAGE } from "@/lib/upload-utils";
import { formatFileSize, type StorageStats } from "@/lib/file-utils";
import { useI18n } from "@/lib/i18n";

export function UploadZone({ children }: { children: React.ReactNode }) {
  const { currentFolderId } = useFileStore();
  const queryClient = useQueryClient();
  const { t } = useI18n();

  const [isDragging, setIsDragging] = useState(false);
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
            className="absolute inset-0 z-50 flex items-center justify-center bg-emerald-500/5 border-[3px] border-dashed border-emerald-400/50 rounded-lg backdrop-blur-[2px] animate-border-dash"
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
                <p className="text-lg font-semibold">Drop files to upload</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Files will be uploaded to the current folder
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
