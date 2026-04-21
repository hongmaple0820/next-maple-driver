"use client";

import { useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MoreVertical, Star, Download, Pencil, FolderInput, Share2, Trash2, RotateCcw, X, Copy, Archive } from "lucide-react";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FileTypeIcon } from "@/components/file-type-icon";
import { formatFileSize, formatDate, getFileTypeLabel, getFileExtension, type FileItem } from "@/lib/file-utils";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface FileCardProps {
  file: FileItem;
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
    addActivity,
  } = useFileStore();

  const queryClient = useQueryClient();
  const [isHovered, setIsHovered] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const isSelected = selectedFileIds.has(file.id);
  const ext = file.type === "file" ? getFileExtension(file.name) : "";

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
    try {
      const res = await fetch("/api/files/star", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: file.id, starred: !file.starred }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["files"] });
        addActivity({ action: "star", fileName: file.name });
      }
    } catch {
      // Error handled silently
    }
  }, [file, queryClient, addActivity]);

  const handleDelete = useCallback(async () => {
    try {
      const res = await fetch("/api/files", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: file.id, permanent: section === "trash" }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["files"] });
        queryClient.invalidateQueries({ queryKey: ["storage-stats"] });
        addActivity({ action: "delete", fileName: file.name });
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
  }, [file, addActivity]);

  const handleDownloadZip = useCallback(async () => {
    try {
      const res = await fetch("/api/files/download-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds: [file.id] }),
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
      a.download = `${file.name}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success(`Downloaded "${file.name}" as ZIP`);
    } catch {
      toast.error("Failed to download ZIP");
    }
  }, [file]);

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

  const actionItems = (
    <>
      {section !== "trash" && (
        <>
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
          <DropdownMenuItem onClick={() => setRenameFile({ id: file.id, name: file.name })}>
            <Pencil className="w-4 h-4" /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleStar}>
            <Star className={cn("w-4 h-4", file.starred && "fill-yellow-400 text-yellow-400")} />
            {file.starred ? "Unstar" : "Star"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMoveFile({ id: file.id, name: file.name, parentId: file.parentId })}>
            <FolderInput className="w-4 h-4" /> Move to...
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleCopy}>
            <Copy className="w-4 h-4" /> Copy
          </DropdownMenuItem>
          {file.type === "file" && (
            <DropdownMenuItem onClick={() => setShareFile({ id: file.id, name: file.name })}>
              <Share2 className="w-4 h-4" /> Share
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
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
          <ContextMenuItem onClick={() => setRenameFile({ id: file.id, name: file.name })}>
            <Pencil className="w-4 h-4" /> Rename
          </ContextMenuItem>
          <ContextMenuItem onClick={handleStar}>
            <Star className={cn("w-4 h-4", file.starred && "fill-yellow-400 text-yellow-400")} />
            {file.starred ? "Unstar" : "Star"}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => setMoveFile({ id: file.id, name: file.name, parentId: file.parentId })}>
            <FolderInput className="w-4 h-4" /> Move to...
          </ContextMenuItem>
          <ContextMenuItem onClick={handleCopy}>
            <Copy className="w-4 h-4" /> Copy
          </ContextMenuItem>
          {file.type === "file" && (
            <ContextMenuItem onClick={() => setShareFile({ id: file.id, name: file.name })}>
              <Share2 className="w-4 h-4" /> Share
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
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
          whileHover={{ y: -2, scale: 1.02 }}
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
              "group relative cursor-pointer transition-all duration-200 border-2 overflow-hidden",
              isSelected
                ? "border-emerald-500 shadow-emerald-500/20 shadow-lg bg-emerald-500/5 border-b-2 border-b-emerald-500/30"
                : isDragOver && file.type === "folder"
                ? "border-emerald-500 shadow-emerald-500/20 shadow-lg bg-emerald-500/5 scale-[1.02]"
                : "border-transparent hover:border-border hover:shadow-md hover:border-b-2 hover:border-b-emerald-500/30"
            )}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
          >
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
                  className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center"
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
                isHovered || isSelected ? "opacity-100" : "opacity-0"
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

            <CardContent className="flex flex-col items-center gap-2 sm:p-4 p-3 sm:pb-3 pb-2 relative z-[2]">
              {/* Icon / Thumbnail */}
              {isImage ? (
                <div className="mt-1 w-full aspect-square sm:max-w-[80px] max-w-[60px] rounded-lg overflow-hidden bg-muted relative">
                  <img
                    src={`/api/files/download?id=${file.id}&mode=inline`}
                    alt={file.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="mt-1">
                  <FileTypeIcon file={file} className="sm:w-14 sm:h-14 w-10 h-10" strokeWidth={1.2} />
                </div>
              )}

              {/* File name */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center justify-center gap-1.5 w-full sm:mt-1 mt-0">
                    <p className="sm:text-sm text-xs font-medium text-center leading-tight line-clamp-2 min-w-0">
                      {file.name}
                    </p>
                    {ext && (
                      <Badge variant="secondary" className="shrink-0 text-[9px] px-1 py-0 h-4 font-mono hidden sm:inline-flex">
                        .{ext}
                      </Badge>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Modified {formatDate(file.updatedAt)}
                </TooltipContent>
              </Tooltip>

              {/* Meta info */}
              <p className="sm:text-xs text-[11px] text-muted-foreground text-center">
                {file.type === "folder"
                  ? `${file.childrenCount ?? 0} items`
                  : `${formatFileSize(file.size)} · ${formatDate(file.updatedAt)}`}
              </p>

              {/* Description preview */}
              {file.description && (
                <p className="sm:text-[11px] text-[10px] text-muted-foreground/70 text-center w-full line-clamp-1 leading-tight">
                  {file.description}
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
