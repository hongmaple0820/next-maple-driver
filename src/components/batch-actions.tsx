"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Star, Trash2, X, Archive, Pencil, Loader2, HardDrive } from "lucide-react";
import { useFileStore } from "@/store/file-store";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { showUndoToast, invalidateAfterUndo } from "@/lib/undo-toast";
import { useI18n } from "@/lib/i18n";

export function BatchActions() {
  const { selectedFileIds, clearSelection, section, setBatchRenameOpen, setCrossDriverMoveOpen, setCrossDriverMoveFileIds } = useFileStore();
  const queryClient = useQueryClient();
  const { t } = useI18n();
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
    setDownloadProgress(0);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/files/download-zip", true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.responseType = "blob";

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 50);
        setDownloadProgress(percent);
      }
    };

    xhr.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = 50 + Math.round((event.loaded / event.total) * 50);
        setDownloadProgress(percent);
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
        toast.success(`Downloaded ${fileIds.length} item${fileIds.length > 1 ? "s" : ""} as ZIP`);
        clearSelection();
      } else {
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
      toast.error(t.app.zipDownloadFailed);
    };

    xhr.send(JSON.stringify({ fileIds }));
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-foreground text-background px-5 py-3 rounded-full shadow-lg"
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
                {t.app.downloadingZip} {downloadProgress}%
              </>
            ) : (
              <>
                <Archive className="w-4 h-4" />
                {t.app.downloadZip}
              </>
            )}
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
            {t.app.rename}
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
            {t.app.star}
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
            {t.app.crossDriverTransfer}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBatchDelete}
          className="text-background hover:bg-background/20 gap-1.5"
        >
          <Trash2 className="w-4 h-4" />
          {section === "trash" ? t.app.delete : t.app.trashAction}
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
  );
}
