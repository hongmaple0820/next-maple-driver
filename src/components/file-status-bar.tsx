"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useFileStore } from "@/store/file-store";
import { formatFileSize, matchesTypeFilter, type FileItem, type StorageStats } from "@/lib/file-utils";
import { Folder, File, CheckCircle2, ArrowUpCircle, HardDrive } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

// Animated number component
function AnimatedNumber({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(value);
  const prevValueRef = useRef(value);

  useEffect(() => {
    const prevValue = prevValueRef.current;
    if (prevValue === value) return;
    prevValueRef.current = value;

    const duration = 300;
    const startTime = Date.now();
    const startValue = prevValue;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(startValue + (value - startValue) * eased));
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  }, [value]);

  return <>{displayValue}</>;
}

export function FileStatusBar() {
  const { currentFolderId, section, searchQuery, typeFilter, selectedFileIds, currentDriverId, uploadProgress } = useFileStore();
  const { t } = useI18n();

  const isSearch = searchQuery.trim().length > 0;
  const activeUploads = uploadProgress.filter(u => u.status === "uploading");

  const { data: files = [] } = useQuery<FileItem[]>({
    queryKey: ["files", currentFolderId, section, searchQuery, currentDriverId],
    queryFn: async () => {
      if (isSearch) {
        const res = await fetch(`/api/files/search?q=${encodeURIComponent(searchQuery)}`);
        if (!res.ok) throw new Error("Search failed");
        return res.json();
      }
      if (section === "recent") {
        const res = await fetch("/api/files/recent");
        if (!res.ok) throw new Error("Failed to fetch recent files");
        return res.json();
      }
      const trashed = section === "trash";
      const starred = section === "starred";
      const params = new URLSearchParams();
      if (!starred) {
        params.set("parentId", currentFolderId);
      }
      params.set("trashed", String(trashed));
      if (starred) {
        params.set("starred", "true");
      }
      if (currentDriverId) {
        params.set("driverId", currentDriverId);
      }
      const res = await fetch(`/api/files?${params}`);
      if (!res.ok) throw new Error("Failed to fetch files");
      return res.json();
    },
  });

  const { data: stats } = useQuery<StorageStats>({
    queryKey: ["storage-stats"],
    queryFn: async () => {
      const res = await fetch("/api/files/stats");
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const filteredFiles = typeFilter === "all"
    ? files
    : files.filter((file) => matchesTypeFilter(file, typeFilter));

  const fileCount = filteredFiles.length;
  const folderCount = filteredFiles.filter(f => f.type === "folder").length;
  const onlyFileCount = fileCount - folderCount;
  const totalSize = filteredFiles.reduce((sum, f) => sum + (f.size ?? 0), 0);
  const selectedCount = selectedFileIds.size;

  return (
    <div className="border-t border-border/60 bg-muted/20 backdrop-blur-sm px-4 py-1.5 flex items-center justify-between text-xs text-muted-foreground">
      <AnimatePresence mode="wait">
        <motion.div
          key={`${fileCount}-${totalSize}`}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
          className="flex items-center gap-3"
        >
          {/* Folder count */}
          <div className="flex items-center gap-1.5">
            {folderCount > 0 && (
              <span className="flex items-center gap-1">
                <Folder className="w-3 h-3 text-amber-500/70" />
                <span><AnimatedNumber value={folderCount} /> {folderCount === 1 ? "folder" : "folders"}</span>
              </span>
            )}
            {onlyFileCount > 0 && (
              <span className="flex items-center gap-1">
                <File className="w-3 h-3 text-sky-500/70" />
                <span><AnimatedNumber value={onlyFileCount} /> {onlyFileCount === 1 ? "file" : "files"}</span>
              </span>
            )}
            {fileCount === 0 && (
              <span>0 items</span>
            )}
          </div>
          {/* Divider */}
          {fileCount > 0 && (
            <>
              <div className="w-px h-3 bg-border/40" />
              <span className="flex items-center gap-1">
                <HardDrive className="w-3 h-3 text-muted-foreground/50" />
                {formatFileSize(totalSize)}
              </span>
            </>
          )}
          {/* Storage usage indicator */}
          {stats && (
            <>
              <div className="w-px h-3 bg-border/40" />
              <div className="flex items-center gap-1.5">
                <div className="relative overflow-hidden w-16 h-1">
                  <Progress value={(stats.usedBytes / stats.totalBytes) * 100} className="w-16 h-1" />
                  <div className="progress-shimmer absolute inset-0 pointer-events-none" />
                </div>
                <span><AnimatedNumber value={Math.round((stats.usedBytes / stats.totalBytes) * 100)} />% {t.app.used}</span>
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>
      <div className="flex items-center gap-3">
        {/* Active uploads indicator */}
        {activeUploads.length > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-sky-500/10"
          >
            <ArrowUpCircle className="w-3 h-3 text-sky-500 animate-pulse" />
            <span className="text-sky-600 dark:text-sky-400 font-medium">
              {activeUploads.length} {activeUploads.length === 1 ? "upload" : "uploads"} in progress
            </span>
          </motion.div>
        )}
        {/* Selected count */}
        {selectedCount > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10"
          >
            <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
              <AnimatedNumber value={selectedCount} /> selected
            </span>
          </motion.div>
        )}
      </div>
    </div>
  );
}
