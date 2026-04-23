"use client";

import { useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MoreVertical, Star, Download, Pencil, FolderInput, Share2, Trash2, RotateCcw, X, Copy, Archive, Info, Palette, Folder, File, FileArchive, HardDrive } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useFileStore } from "@/store/file-store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FileTypeIcon } from "@/components/file-type-icon";
import { formatFileSize, formatDate, formatRelativeTime, getFileTypeLabel, getFileExtension, getFileNameWithoutExtension, getColorLabelStyle, COLOR_LABELS, isArchiveFile, type FileItem } from "@/lib/file-utils";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { showUndoToast, invalidateAfterUndo } from "@/lib/undo-toast";
import { useI18n } from "@/lib/i18n";

interface FileCardProps {
  file: FileItem;
}

// Color label submenu items for reuse
function ColorLabelSubmenuItems({ file, queryClient, onColorSelect }: { file: FileItem; queryClient: ReturnType<typeof useQueryClient>; onColorSelect?: (color: string) => void }) {
  const handleSetColor = useCallback(async (color: string) => {
    const oldLabel = file.colorLabel ?? "";
    const newLabel = file.colorLabel === color ? "" : color;
    try {
      const res = await fetch("/api/files", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: file.id, colorLabel: newLabel }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["files"] });
        onColorSelect?.(newLabel);
        showUndoToast(
          `Changed color of "${file.name}"`,
          async () => {
            const undoRes = await fetch("/api/files", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: file.id, colorLabel: oldLabel }),
            });
            if (undoRes.ok) invalidateAfterUndo(queryClient);
          },
          { onSuccess: `Reverted color of "${file.name}"` },
        );
      }
    } catch {
      toast.error("Failed to update color label");
    }
  }, [file, queryClient, onColorSelect]);

  return (
    <>
      <div className="grid grid-cols-4 gap-1 p-1">
        {Object.entries(COLOR_LABELS).map(([key, style]) => (
          <button
            key={key}
            onClick={() => handleSetColor(key)}
            className={cn(
              "w-6 h-6 rounded-full transition-all duration-150 hover:scale-110 flex items-center justify-center",
              style.dot,
              file.colorLabel === key && "ring-2 ring-foreground ring-offset-2 ring-offset-background"
            )}
            title={style.label}
          >
            {file.colorLabel === key && (
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        ))}
      </div>
      {file.colorLabel && (
        <DropdownMenuItem
          className="text-xs text-muted-foreground"
          onClick={() => handleSetColor(file.colorLabel!)}
        >
          Remove Color
        </DropdownMenuItem>
      )}
    </>
  );
}

// Context menu color label items
function ColorLabelContextMenuItems({ file, queryClient }: { file: FileItem; queryClient: ReturnType<typeof useQueryClient> }) {
  const handleSetColor = useCallback(async (color: string) => {
    const oldLabel = file.colorLabel ?? "";
    const newLabel = file.colorLabel === color ? "" : color;
    try {
      const res = await fetch("/api/files", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: file.id, colorLabel: newLabel }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["files"] });
        showUndoToast(
          `Changed color of "${file.name}"`,
          async () => {
            const undoRes = await fetch("/api/files", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: file.id, colorLabel: oldLabel }),
            });
            if (undoRes.ok) invalidateAfterUndo(queryClient);
          },
          { onSuccess: `Reverted color of "${file.name}"` },
        );
      }
    } catch {
      toast.error("Failed to update color label");
    }
  }, [file, queryClient]);

  return (
    <>
      <div className="grid grid-cols-4 gap-1 p-1">
        {Object.entries(COLOR_LABELS).map(([key, style]) => (
          <button
            key={key}
            onClick={() => handleSetColor(key)}
            className={cn(
              "w-6 h-6 rounded-full transition-all duration-150 hover:scale-110 flex items-center justify-center",
              style.dot,
              file.colorLabel === key && "ring-2 ring-foreground ring-offset-2 ring-offset-background"
            )}
            title={style.label}
          >
            {file.colorLabel === key && (
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        ))}
      </div>
      {file.colorLabel && (
        <ContextMenuItem
          className="text-xs text-muted-foreground"
          onClick={() => handleSetColor(file.colorLabel!)}
        >
          Remove Color
        </ContextMenuItem>
      )}
    </>
  );
}

export function FileCard({ file }: FileCardProps) {
  const {
    currentFolderId,
    setCurrentFolderId,
    section,
    selectedFileIds,
    toggleSelect,
    setDetailFile,
    setRenameFile,
    setMoveFile,
    setShareFile,
    setPreviewFile,
    setPropertiesFile,
    addActivity,
    compactMode,
    showExtensions,
    setCrossDriverMoveOpen,
    setCrossDriverMoveFileIds,
  } = useFileStore();

  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [isHovered, setIsHovered] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const isSelected = selectedFileIds.has(file.id);

  const ext = file.type === "file" ? getFileExtension(file.name) : "";
  const colorStyle = getColorLabelStyle(file.colorLabel);

  const isImage = file.type === "file" && (() => {
    const extLower = getFileExtension(file.name);
    return ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(extLower);
  })();

  const handleClick = useCallback(() => {
    if (file.type === "folder") {
      setCurrentFolderId(file.id);
    } else {
      setDetailFile(file);
    }
  }, [file, setCurrentFolderId, setDetailFile]);

  const handleDoubleClick = useCallback(() => {
    if (file.type === "folder") {
      setCurrentFolderId(file.id);
    } else {
      setPreviewFile({
        id: file.id,
        name: file.name,
        type: file.type,
        mimeType: file.mimeType,
        url: file.url,
      });
    }
  }, [file, setCurrentFolderId, setPreviewFile]);

  const handleStar = useCallback(async () => {
    const wasStarred = file.starred;
    try {
      const res = await fetch("/api/files/star", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: file.id, starred: !wasStarred }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["files"] });
        addActivity({ action: "star", fileName: file.name });
        showUndoToast(
          wasStarred ? `Unstarred "${file.name}"` : `Starred "${file.name}"`,
          async () => {
            const undoRes = await fetch("/api/files/star", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: file.id, starred: wasStarred }),
            });
            if (undoRes.ok) invalidateAfterUndo(queryClient);
          },
          { onSuccess: wasStarred ? `Re-starred "${file.name}"` : `Unstarred "${file.name}"` },
        );
      }
    } catch {
      // Error handled silently
    }
  }, [file, queryClient, addActivity]);

  const handleDelete = useCallback(async () => {
    const isPermanent = section === "trash";
    try {
      const res = await fetch("/api/files", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: file.id, permanent: isPermanent }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["files"] });
        queryClient.invalidateQueries({ queryKey: ["storage-stats"] });
        addActivity({ action: "delete", fileName: file.name });
        // Show undo toast only for move-to-trash (not permanent delete)
        if (!isPermanent) {
          showUndoToast(
            `Moved "${file.name}" to trash`,
            async () => {
              const undoRes = await fetch("/api/files/restore", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: file.id }),
              });
              if (undoRes.ok) invalidateAfterUndo(queryClient);
            },
            { onSuccess: `Restored "${file.name}"` },
          );
        }
      }
    } catch {
      // Error handled silently
    }
  }, [file, section, queryClient, addActivity]);

  const handleRestore = useCallback(async () => {
    try {
      const res = await fetch("/api/files/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: file.id }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["files"] });
        queryClient.invalidateQueries({ queryKey: ["storage-stats"] });
      }
    } catch {
      // Error handled silently
    }
  }, [file, queryClient]);

  const handleDownload = useCallback(() => {
    window.open(`/api/files/download?id=${file.id}`, "_blank");
    addActivity({ action: "download", fileName: file.name });
  }, [file, addActivity, t]);

  const handleDownloadZip = useCallback(async () => {
    try {
      const res = await fetch("/api/files/download-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds: [file.id] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: t.app.download + " failed" }));
        toast.error(data.error || "Failed to download ZIP");
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${file.name}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success(`Downloaded "${file.name}" as ZIP`);
    } catch {
      toast.error("Failed to download ZIP");
    }
  }, [file, t]);

  const handleCopy = useCallback(async () => {
    try {
      const res = await fetch("/api/files/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: file.id }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["files"] });
        queryClient.invalidateQueries({ queryKey: ["storage-stats"] });
        addActivity({ action: "copy", fileName: file.name });
      }
    } catch {
      // Error handled silently
    }
  }, [file, queryClient, addActivity]);

  const handleExtract = useCallback(async () => {
    try {
      toast.loading(`${t.app.extracting} "${file.name}"...`, { id: "extract" });
      const res = await fetch("/api/files/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: file.id }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`${t.app.extractionComplete} "${data.folderName}" (${data.extractedCount} ${t.app.items})`, { id: "extract" });
        queryClient.invalidateQueries({ queryKey: ["files"] });
        queryClient.invalidateQueries({ queryKey: ["storage-stats"] });
        addActivity({ action: "created", fileName: data.folderName });
      } else {
        const data = await res.json().catch(() => ({ error: "Extraction failed" }));
        toast.error(data.error || t.app.extractionFailed, { id: "extract" });
      }
    } catch {
      toast.error(t.app.extractionFailed, { id: "extract" });
    }
  }, [file, queryClient, addActivity, t]);

  const actionItems = (
    <>
      {section !== "trash" && (
        <>
          {/* Open/Download group */}
          {file.type === "folder" && (
            <DropdownMenuItem onClick={() => setCurrentFolderId(file.id)}>
              <FolderInput className="w-4 h-4" /> Open
            </DropdownMenuItem>
          )}
          {file.type === "file" && (
            <DropdownMenuItem onClick={handleDownload}>
              <Download className="w-4 h-4" /> Download
            </DropdownMenuItem>
          )}
          {file.type === "folder" && (
            <DropdownMenuItem onClick={handleDownloadZip}>
              <Archive className="w-4 h-4" /> Download as ZIP
            </DropdownMenuItem>
          )}
          {file.type === "file" && isArchiveFile(file) && (
            <DropdownMenuItem onClick={handleExtract}>
              <FileArchive className="w-4 h-4" /> {t.app.extract}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {/* Edit group */}
          <DropdownMenuItem onClick={() => setRenameFile({ id: file.id, name: file.name })}>
            <Pencil className="w-4 h-4" /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleStar}>
            <Star className={cn("w-4 h-4", file.starred && "fill-yellow-400 text-yellow-400")} />
            {file.starred ? t.app.unstar : "Star"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMoveFile({ id: file.id, name: file.name, parentId: file.parentId })}>
            <FolderInput className="w-4 h-4" /> Move to...
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => { setCrossDriverMoveFileIds([file.id]); setCrossDriverMoveOpen(true); }}>
            <HardDrive className="w-4 h-4" /> {t.app.crossDriverTransfer}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleCopy}>
            <Copy className="w-4 h-4" /> Copy
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* Color Label submenu */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Palette className="w-4 h-4" />
              Color Label
              {colorStyle && (
                <span className={cn("w-3 h-3 rounded-full ml-auto", colorStyle.dot)} />
              )}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-[140px]">
              <ColorLabelSubmenuItems file={file} queryClient={queryClient} />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          {/* Share & Info group */}
          {file.type === "file" && (
            <DropdownMenuItem onClick={() => setShareFile({ id: file.id, name: file.name })}>
              <Share2 className="w-4 h-4" /> Share
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setPropertiesFile({ id: file.id, name: file.name })}>
            <Info className="w-4 h-4" /> Properties
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* Destructive group */}
          <DropdownMenuItem variant="destructive" onClick={handleDelete}>
            <Trash2 className="w-4 h-4" /> Move to Trash
          </DropdownMenuItem>
        </>
      )}
      {section === "trash" && (
        <>
          <DropdownMenuItem onClick={handleRestore}>
            <RotateCcw className="w-4 h-4" /> Restore
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={handleDelete}>
            <X className="w-4 h-4" /> Delete Permanently
          </DropdownMenuItem>
        </>
      )}
    </>
  );

  const contextActionItems = (
    <>
      {section !== "trash" && (
        <>
          {/* Open/Download group */}
          {file.type === "folder" && (
            <ContextMenuItem onClick={() => setCurrentFolderId(file.id)}>
              <FolderInput className="w-4 h-4" /> Open
            </ContextMenuItem>
          )}
          {file.type === "file" && (
            <ContextMenuItem onClick={handleDownload}>
              <Download className="w-4 h-4" /> Download
            </ContextMenuItem>
          )}
          {file.type === "folder" && (
            <ContextMenuItem onClick={handleDownloadZip}>
              <Archive className="w-4 h-4" /> Download as ZIP
            </ContextMenuItem>
          )}
          {file.type === "file" && isArchiveFile(file) && (
            <ContextMenuItem onClick={handleExtract}>
              <FileArchive className="w-4 h-4" /> {t.app.extract}
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          {/* Edit group */}
          <ContextMenuItem onClick={() => setRenameFile({ id: file.id, name: file.name })}>
            <Pencil className="w-4 h-4" /> Rename
          </ContextMenuItem>
          <ContextMenuItem onClick={handleStar}>
            <Star className={cn("w-4 h-4", file.starred && "fill-yellow-400 text-yellow-400")} />
            {file.starred ? t.app.unstar : "Star"}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => setMoveFile({ id: file.id, name: file.name, parentId: file.parentId })}>
            <FolderInput className="w-4 h-4" /> Move to...
          </ContextMenuItem>
          <ContextMenuItem onClick={() => { setCrossDriverMoveFileIds([file.id]); setCrossDriverMoveOpen(true); }}>
            <HardDrive className="w-4 h-4" /> {t.app.crossDriverTransfer}
          </ContextMenuItem>
          <ContextMenuItem onClick={handleCopy}>
            <Copy className="w-4 h-4" /> Copy
          </ContextMenuItem>
          <ContextMenuSeparator />
          {/* Color Label submenu */}
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Palette className="w-4 h-4" />
              Color Label
              {colorStyle && (
                <span className={cn("w-3 h-3 rounded-full ml-auto", colorStyle.dot)} />
              )}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-[140px]">
              <ColorLabelContextMenuItems file={file} queryClient={queryClient} />
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSeparator />
          {/* Share & Info group */}
          {file.type === "file" && (
            <ContextMenuItem onClick={() => setShareFile({ id: file.id, name: file.name })}>
              <Share2 className="w-4 h-4" /> Share
            </ContextMenuItem>
          )}
          <ContextMenuItem onClick={() => setPropertiesFile({ id: file.id, name: file.name })}>
            <Info className="w-4 h-4" /> Properties
          </ContextMenuItem>
          <ContextMenuSeparator />
          {/* Destructive group */}
          <ContextMenuItem variant="destructive" onClick={handleDelete}>
            <Trash2 className="w-4 h-4" /> Move to Trash
          </ContextMenuItem>
        </>
      )}
      {section === "trash" && (
        <>
          <ContextMenuItem onClick={handleRestore}>
            <RotateCcw className="w-4 h-4" /> Restore
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onClick={handleDelete}>
            <X className="w-4 h-4" /> Delete Permanently
          </ContextMenuItem>
        </>
      )}
    </>
  );

  // Drag handlers
  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", file.id);
    e.dataTransfer.effectAllowed = "move";
    setIsDragging(true);
  }, [file.id]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (file.type === "folder") {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      setIsDragOver(true);
    }
  }, [file.type]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const draggedFileId = e.dataTransfer.getData("text/plain");
    if (!draggedFileId || draggedFileId === file.id) return;
    // Don't allow dropping a folder into itself
    if (file.type !== "folder") return;

    try {
      const res = await fetch("/api/files/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: draggedFileId, targetParentId: file.id }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["files"] });
        queryClient.invalidateQueries({ queryKey: ["storage-stats"] });
        toast.success(`Moved to ${file.name}`);
      } else {
        toast.error("Failed to move item");
      }
    } catch {
      toast.error("Failed to move item");
    }
  }, [file, queryClient]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: isDragging ? 0.5 : 1, y: 0 }}
          transition={{ duration: 0.2 }}
          whileHover={{ scale: 1.02 }}
          layout
          onHoverStart={() => setIsHovered(true)}
          onHoverEnd={() => setIsHovered(false)}
          draggable
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <Card
            className={cn(
              "group relative cursor-pointer transition-all duration-300 border overflow-hidden hover:-translate-y-1 hover:shadow-xl hover:shadow-emerald-500/5 focus-within:ring-2 focus-within:ring-emerald-500/40 focus-within:ring-offset-2",
              "after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-emerald-500/0 hover:after:bg-emerald-500/40 after:transition-colors after:duration-300",
              isSelected
                ? "border-emerald-500/60 shadow-md shadow-emerald-500/15 bg-emerald-500/5 dark:bg-emerald-500/10"
                : isDragOver && file.type === "folder"
                ? "border-emerald-500/60 shadow-md shadow-emerald-500/15 bg-emerald-500/5 scale-[1.02]"
                : "border-border/50 bg-card hover:border-border hover:bg-accent/20",
              colorStyle && !isSelected && !isDragOver && colorStyle.border
            )}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
          >
            {/* Color label indicator dot - top right corner */}
            {colorStyle && (
              <div className={cn("absolute top-2 right-2 z-20 w-2 h-2 rounded-full", colorStyle.dot)} />
            )}

            {/* Selection indicator */}
            <motion.div
              layout
              className="absolute top-2 left-2 z-10"
            >
              {isSelected && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 25 }}
                  className={cn(
                    "w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center animate-pulse-once"
                  )}
                >
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </motion.div>
              )}
            </motion.div>

            {/* Star badge with animation */}
            <AnimatePresence>
              {file.starred && !isSelected && (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 25 }}
                  className="absolute top-2 left-2 z-10"
                >
                  <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Action menu */}
            <div
              className={cn(
                "absolute top-2 right-2 z-10 transition-opacity",
                isHovered || isSelected ? "opacity-100" : "opacity-0",
                colorStyle && "right-7"
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-7 w-7 rounded-full shadow-sm"
                  >
                    <MoreVertical className="w-3.5 h-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {actionItems}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <CardContent className={cn(
              "flex flex-col items-center gap-2 relative z-[2]",
              compactMode ? "p-2 pb-1.5 min-h-[80px]" : "sm:p-4 p-3 sm:pb-3 pb-2 min-h-[120px]"
            )}>
              {/* Icon / Thumbnail - consistent height area */}
              <div className={cn(
                "flex items-center justify-center mt-1",
                compactMode ? "h-8" : "sm:h-14 h-10"
              )}>
                {isImage ? (
                  <div className={cn(
                    "w-full aspect-square rounded-lg overflow-hidden bg-muted",
                    compactMode ? "max-w-[40px]" : "sm:max-w-[80px] max-w-[60px]"
                  )}>
                    <img
                      src={`/api/files/download?id=${file.id}&mode=inline`}
                      alt={file.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <FileTypeIcon file={file} className={compactMode ? "w-8 h-8" : "sm:w-14 sm:h-14 w-10 h-10"} strokeWidth={compactMode ? 1.5 : 1.2} />
                )}
              </div>

              {/* File name - consistent height with truncation */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center justify-center gap-1.5 w-full sm:mt-1 mt-0 h-8">
                    {colorStyle && (
                      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", colorStyle.dot)} />
                    )}
                    <p className={cn(
                      "font-medium text-center leading-tight line-clamp-2 min-w-0",
                      compactMode ? "text-[11px]" : "sm:text-sm text-xs"
                    )}>
                      {ext && showExtensions ? getFileNameWithoutExtension(file.name) : file.name}
                    </p>
                    {ext && showExtensions && (
                      <Badge variant="secondary" className={cn(
                        "shrink-0 font-mono",
                        compactMode ? "text-[8px] px-0.5 py-0 h-3.5" : "text-[9px] px-1 py-0 h-4",
                        !compactMode && "hidden sm:inline-flex"
                      )}>
                        .{ext}
                      </Badge>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs max-w-[250px] break-all">
                  <p className="font-medium">{file.name}</p>
                  <p className="text-muted-foreground mt-0.5">Modified {formatDate(file.updatedAt)}</p>
                </TooltipContent>
              </Tooltip>

              {/* Separator line */}
              {!compactMode && (
                <div className="w-full border-b border-border/30" />
              )}
              {/* Meta info */}
              {!compactMode && (
                <div className="w-full flex flex-col items-center gap-0.5 mt-auto relative">
                  {file.type === "folder" ? (
                    <div className="flex items-center gap-1">
                      <p className="sm:text-xs text-[11px] text-muted-foreground/80 dark:text-muted-foreground flex items-center gap-1">
                        <Folder className="w-3 h-3" />
                        {file.childrenCount ?? 0} items
                      </p>
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-muted-foreground ml-1">Open</span>
                    </div>
                  ) : (
                    <>
                      <p className="sm:text-xs text-[11px] text-muted-foreground/80 dark:text-muted-foreground flex items-center gap-1">
                        <File className="w-3 h-3" />
                        {formatFileSize(file.size)}
                      </p>
                      <p className="text-[10px] text-muted-foreground/60">
                        {formatRelativeTime(file.updatedAt)}
                      </p>
                    </>
                  )}
                </div>
              )}
              {compactMode && file.type === "file" && (
                <p className="text-[10px] text-muted-foreground/70 text-center mt-auto flex items-center gap-0.5">
                  <File className="w-2.5 h-2.5" />
                  {formatFileSize(file.size)}
                </p>
              )}
              {compactMode && file.type === "folder" && (
                <p className="text-[10px] text-muted-foreground/70 text-center mt-auto flex items-center gap-0.5">
                  <Folder className="w-2.5 h-2.5" />
                  {file.childrenCount ?? 0}
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        {contextActionItems}
      </ContextMenuContent>
    </ContextMenu>
  );
}
