"use client";

import { useCallback, useState, useRef } from "react";
import { Upload } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useFileStore } from "@/store/file-store";
import { toast } from "sonner";

export function UploadZone({ children }: { children: React.ReactNode }) {
  const { currentFolderId } = useFileStore();
  const queryClient = useQueryClient();

  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      for (const file of fileArray) {
        const toastId = `upload-${Date.now()}-${file.name}`;

        toast.loading(`Uploading ${file.name}...`, {
          id: toastId,
          description: "0%",
        });

        const formData = new FormData();
        formData.append("files", file);
        formData.append("parentId", currentFolderId);

        try {
          const res = await fetch("/api/files/upload", {
            method: "POST",
            body: formData,
          });

          if (res.ok) {
            toast.success(`${file.name} uploaded`, { id: toastId });
            queryClient.invalidateQueries({ queryKey: ["files"] });
            queryClient.invalidateQueries({ queryKey: ["storage-stats"] });
          } else {
            toast.error(`Failed to upload ${file.name}`, { id: toastId });
          }
        } catch {
          toast.error(`Failed to upload ${file.name}`, { id: toastId });
        }
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
    </div>
  );
}
