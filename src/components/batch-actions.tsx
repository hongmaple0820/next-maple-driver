"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Star, Trash2, X, Archive, Pencil, Loader2, HardDrive, FolderInput, Copy } from "lucide-react";
import { useFileStore } from "@/store/file-store";
import { useTaskStore } from "@/store/task-store";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { showUndoToast, invalidateAfterUndo } from "@/lib/undo-toast";
import { useI18n } from "@/lib/i18n";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function BatchActions() {
  const {
    selectedFileIds,
    clearSelection,
    section,
    setBatchRenameOpen,
    setCrossDriverMoveOpen,
    setCrossDriverMoveFileIds,
    setBatchMoveOpen,
    setBatchCopyOpen,
    setBatchOperationFileIds,
    batchDeleteOpen,
    setBatchDeleteOpen,
  } = useFileStore();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const taskStore = useTaskStore();
  const count = selectedFileIds.size;
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);

  if (count === 0) return null;

  const handleBatchStar = async () => {
    const ids = Array.from(selectedFileIds);
    for (const id of ids) {
      await fetch("/api/files/star", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, starred: true }),
      });
    }
    queryClient.invalidateQueries({ queryKey: ["files"] });
    clearSelection();
    showUndoToast(
      `Starred ${ids.length} item${ids.length > 1 ? "s" : ""}`,
      async () => {
        for (const id of ids) {
          await fetch("/api/files/star", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, starred: false }),
          });
        }
        invalidateAfterUndo(queryClient);
      },
      { onSuccess: `Unstarred ${ids.length} item${ids.length > 1 ? "s" : ""}` },
    );
  };

  const handleBatchDelete = async () => {
    const isPermanent = section === "trash";
    const ids = Array.from(selectedFileIds);
    for (const id of ids) {
      await fetch("/api/files", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, permanent: isPermanent }),
      });
    }
    queryClient.invalidateQueries({ queryKey: ["files"] });
    queryClient.invalidateQueries({ queryKey: ["storage-stats"] });
    clearSelection();
    setBatchDeleteOpen(false);
    // Show undo toast only for move-to-trash (not permanent delete)
    if (!isPermanent) {
      showUndoToast(
        `Moved ${ids.length} item${ids.length > 1 ? "s" : ""} to trash`,
        async () => {
          for (const id of ids) {
            await fetch("/api/files/restore", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id }),
            });
          }
          invalidateAfterUndo(queryClient);
        },
        { onSuccess: `Restored ${ids.length} item${ids.length > 1 ? "s" : ""}` },
      );
    } else {
      toast.success(`Permanently deleted ${ids.length} item${ids.length > 1 ? "s" : ""}`);
    }
  };

  const handleBatchDownloadZip = () => {
    const fileIds = Array.from(selectedFileIds);

    // Create a task entry for tracking
    const taskId = taskStore.addTask({
      type: "download",
      status: "running",
      progress: 0,
      fileName: `${fileIds.length} files (ZIP)`,
      fileSize: 0,
      speed: 0,
      error: null,
      uploadId: null,
      totalChunks: 0,
      uploadedChunks: 0,
      chunks: [],
      sourcePath: null,
      destPath: null,
      sourceDriverId: null,
      destDriverId: null,
      metadata: { fileIds },
    });

    taskStore.startTask(taskId);
    setDownloadProgress(0);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/files/download-zip", true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.responseType = "blob";

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 50);
        setDownloadProgress(percent);
        taskStore.updateProgress(taskId, percent);
      }
    };

    xhr.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = 50 + Math.round((event.loaded / event.total) * 50);
        setDownloadProgress(percent);
        taskStore.updateProgress(taskId, percent);
      }
    };

    xhr.onload = () => {
      setDownloadProgress(null);
      if (xhr.status >= 200 && xhr.status < 300) {
        const blob = xhr.response as Blob;
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "cloudrive-download.zip";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        taskStore.completeTask(taskId);
        toast.success(t.app.downloadAsTask);
        clearSelection();
      } else {
        taskStore.failTask(taskId, t.app.zipDownloadFailed);
        try {
          const errorBlob = xhr.response as Blob;
          void errorBlob.text().then((text) => {
            try {
              const errorData = JSON.parse(text);
              toast.error(errorData.error || t.app.zipDownloadFailed);
            } catch {
              toast.error(t.app.zipDownloadFailed);
            }
          });
        } catch {
          toast.error(t.app.zipDownloadFailed);
        }
      }
    };

    xhr.onerror = () => {
      setDownloadProgress(null);
      taskStore.failTask(taskId, t.app.zipDownloadFailed);
      toast.error(t.app.zipDownloadFailed);
    };

    xhr.send(JSON.stringify({ fileIds }));
  };

  const handleBatchMove = () => {
    const ids = Array.from(selectedFileIds);
    setBatchOperationFileIds(ids);
    setBatchMoveOpen(true);
  };

  const handleBatchCopy = () => {
    const ids = Array.from(selectedFileIds);
    setBatchOperationFileIds(ids);
    setBatchCopyOpen(true);
  };

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-foreground text-background px-4 py-2.5 rounded-full shadow-lg"
        >
          <span className="text-sm font-medium">{count} {t.app.selected}</span>
          <div className="w-px h-5 bg-background/20" />
          {section !== "trash" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBatchDownloadZip}
              className="text-background hover:bg-background/20 gap-1.5"
              disabled={downloadProgress !== null}
            >
              {downloadProgress !== null ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-xs">{downloadProgress}%</span>
                </>
              ) : (
                <>
                  <Archive className="w-4 h-4" />
                  <span className="hidden sm:inline">{t.app.downloadZip}</span>
                </>
              )}
            </Button>
          )}
          {section !== "trash" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBatchMove}
              className="text-background hover:bg-background/20 gap-1.5"
            >
              <FolderInput className="w-4 h-4" />
              <span className="hidden sm:inline">{t.app.batchMove}</span>
            </Button>
          )}
          {section !== "trash" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBatchCopy}
              className="text-background hover:bg-background/20 gap-1.5"
            >
              <Copy className="w-4 h-4" />
              <span className="hidden sm:inline">{t.app.batchCopy}</span>
            </Button>
          )}
          {section !== "trash" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setBatchRenameOpen(true)}
              className="text-background hover:bg-background/20 gap-1.5"
            >
              <Pencil className="w-4 h-4" />
              <span className="hidden sm:inline">{t.app.rename}</span>
            </Button>
          )}
          {section !== "trash" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBatchStar}
              className="text-background hover:bg-background/20 gap-1.5"
            >
              <Star className="w-4 h-4" />
              <span className="hidden sm:inline">{t.app.star}</span>
            </Button>
          )}
          {section !== "trash" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCrossDriverMoveFileIds(Array.from(selectedFileIds));
                setCrossDriverMoveOpen(true);
              }}
              className="text-background hover:bg-background/20 gap-1.5"
            >
              <HardDrive className="w-4 h-4" />
              <span className="hidden sm:inline">{t.app.crossDriverTransfer}</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setBatchDeleteOpen(true)}
            className="text-background hover:bg-background/20 gap-1.5"
          >
            <Trash2 className="w-4 h-4" />
            <span className="hidden sm:inline">{section === "trash" ? t.app.delete : t.app.trashAction}</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={clearSelection}
            className="text-background hover:bg-background/20 h-7 w-7"
          >
            <X className="w-4 h-4" />
          </Button>
        </motion.div>
      </AnimatePresence>

      {/* Batch Delete Confirmation Dialog */}
      <AlertDialog open={batchDeleteOpen} onOpenChange={setBatchDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {section === "trash" ? t.app.permanentDelete : t.app.trashAction}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {section === "trash"
                ? t.app.batchDeletePermanentConfirm.replace("{count}", String(count))
                : t.app.batchDeleteConfirm.replace("{count}", String(count))
              }
            </AlertDialogDescription>
            <p className="text-sm text-muted-foreground mt-1">
              {section === "trash" ? t.app.itemsWillBeDeleted : t.app.itemsWillBeTrashed}
            </p>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.app.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBatchDelete}
              className={section === "trash" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              {section === "trash" ? t.app.permanentDelete : t.app.trashAction}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
