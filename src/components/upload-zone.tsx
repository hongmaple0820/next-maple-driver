"use client";

import { useCallback, useState, useRef } from "react";
import { Upload, CloudUpload } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useFileStore } from "@/store/file-store";
import { uploadFilesWithProgress } from "@/lib/upload-utils";

export function UploadZone({ children }: { children: React.ReactNode }) {
  const { currentFolderId } = useFileStore();
  const queryClient = useQueryClient();

  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

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
            transition={{ duration: 0.15 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-emerald-500/5 border-[3px] border-dashed border-emerald-400/50 rounded-lg backdrop-blur-[2px]"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              className="flex flex-col items-center gap-4 p-10 rounded-2xl bg-background/95 shadow-2xl border border-emerald-200/50 dark:border-emerald-800/50"
            >
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                <CloudUpload className="w-8 h-8 text-emerald-600" />
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold">Drop files to upload</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Files will be uploaded to the current folder
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
