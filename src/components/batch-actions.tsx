"use client";

import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Star, Trash2, X, Archive } from "lucide-react";
import { useFileStore } from "@/store/file-store";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function BatchActions() {
  const { selectedFileIds, clearSelection, section } = useFileStore();
  const queryClient = useQueryClient();
  const count = selectedFileIds.size;

  if (count === 0) return null;

  const handleBatchStar = async () => {
    for (const id of selectedFileIds) {
      await fetch("/api/files/star", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, starred: true }),
      });
    }
    queryClient.invalidateQueries({ queryKey: ["files"] });
    clearSelection();
  };

  const handleBatchDelete = async () => {
    for (const id of selectedFileIds) {
      await fetch("/api/files", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, permanent: section === "trash" }),
      });
    }
    queryClient.invalidateQueries({ queryKey: ["files"] });
    queryClient.invalidateQueries({ queryKey: ["storage-stats"] });
    clearSelection();
  };

  const handleBatchDownloadZip = async () => {
    try {
      const fileIds = Array.from(selectedFileIds);
      const res = await fetch("/api/files/download-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Download failed" }));
        toast.error(data.error || "Failed to download ZIP");
        return;
      }
      const blob = await res.blob();
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
    } catch {
      toast.error("Failed to download ZIP");
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-foreground text-background px-5 py-3 rounded-full shadow-lg"
      >
        <span className="text-sm font-medium">{count} selected</span>
        <div className="w-px h-5 bg-background/20" />
        {section !== "trash" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBatchDownloadZip}
            className="text-background hover:bg-background/20 gap-1.5"
          >
            <Archive className="w-4 h-4" />
            Download ZIP
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
            Star
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBatchDelete}
          className="text-background hover:bg-background/20 gap-1.5"
        >
          <Trash2 className="w-4 h-4" />
          {section === "trash" ? "Delete" : "Trash"}
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
