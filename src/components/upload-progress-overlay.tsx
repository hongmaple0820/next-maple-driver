"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, ChevronUp, ChevronDown, X, CheckCircle2, AlertCircle, FileIcon } from "lucide-react";
import { useFileStore, type UploadProgress } from "@/store/file-store";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

export function UploadProgressOverlay() {
  const { uploadProgress } = useFileStore();
  const [isExpanded, setIsExpanded] = useState(true);

  const activeUploads = uploadProgress.filter((u) => u.status === "uploading");
  const completedUploads = uploadProgress.filter((u) => u.status === "done");
  const errorUploads = uploadProgress.filter((u) => u.status === "error");
  const totalCount = uploadProgress.length;

  // Auto-hide when all uploads are complete and no errors
  const hasActiveUploads = activeUploads.length > 0;
  const hasItems = totalCount > 0;
  // Show panel when there are active or recently completed/error uploads
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    if (hasActiveUploads) {
      setShouldShow(true);
    } else if (totalCount > 0 && (completedUploads.length > 0 || errorUploads.length > 0)) {
      // Keep showing for completed/error items so user can see results
      setShouldShow(true);
    } else {
      setShouldShow(false);
    }
  }, [hasActiveUploads, totalCount, completedUploads.length, errorUploads.length]);

  // Don't render if nothing to show
  if (!hasItems || !shouldShow) return null;

  // Calculate overall progress
  const overallProgress = totalCount > 0
    ? Math.round(
      uploadProgress.reduce((sum, u) => sum + u.progress, 0) / totalCount
    )
    : 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="fixed bottom-4 right-4 z-50 w-80"
      >
        <div className="bg-background/95 backdrop-blur-lg border border-border/60 rounded-xl shadow-2xl shadow-black/10 dark:shadow-black/30 overflow-hidden">
          {/* Header - always visible */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/30 transition-colors"
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/10">
              <Upload className={cn(
                "w-4 h-4 text-emerald-600 dark:text-emerald-400 transition-transform duration-300",
                hasActiveUploads && "animate-pulse"
              )} />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium truncate">
                {activeUploads.length > 0
                  ? `${activeUploads.length} file${activeUploads.length > 1 ? "s" : ""} uploading...`
                  : completedUploads.length > 0
                  ? "Upload complete!"
                  : "Upload failed"}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <Progress value={overallProgress} className="h-1 flex-1" />
                <span className="text-[11px] text-muted-foreground tabular-nums w-8 text-right">
                  {overallProgress}%
                </span>
              </div>
            </div>
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
            )}
          </button>

          {/* File list - expandable */}
          <AnimatePresence initial={false}>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="border-t border-border/40 max-h-64 overflow-y-auto scrollbar-thin">
                  {uploadProgress.map((upload) => (
                    <UploadItem key={upload.id} upload={upload} />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function UploadItem({ upload }: { upload: UploadProgress }) {
  const { removeUploadProgress } = useFileStore();

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/20 transition-colors group">
      <div className="shrink-0">
        {upload.status === "done" ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        ) : upload.status === "error" ? (
          <AlertCircle className="w-4 h-4 text-destructive" />
        ) : (
          <FileIcon className="w-4 h-4 text-muted-foreground animate-pulse" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{upload.fileName}</p>
        <div className="flex items-center gap-2 mt-1">
          <Progress
            value={upload.progress}
            className={cn(
              "h-0.5 flex-1",
              upload.status === "error" && "[&>div]:bg-destructive",
              upload.status === "done" && "[&>div]:bg-emerald-500"
            )}
          />
          <span className="text-[10px] text-muted-foreground tabular-nums w-7 text-right">
            {upload.status === "done" ? "Done" : upload.status === "error" ? "Error" : `${upload.progress}%`}
          </span>
        </div>
      </div>
      {(upload.status === "done" || upload.status === "error") && (
        <button
          onClick={() => removeUploadProgress(upload.id)}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-muted rounded"
        >
          <X className="w-3 h-3 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}
