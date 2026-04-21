"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { MoreVertical, Star, Download, Pencil, FolderInput, Share2, Trash2, RotateCcw, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useFileStore } from "@/store/file-store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { FileTypeIcon } from "@/components/file-type-icon";
import { formatFileSize, formatDate, getFileTypeLabel, getFileExtension, type FileItem } from "@/lib/file-utils";
import { cn } from "@/lib/utils";

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
  } = useFileStore();

  const queryClient = useQueryClient();
  const [isHovered, setIsHovered] = useState(false);
  const isSelected = selectedFileIds.has(file.id);

  const isImage = file.type === "file" && (() => {
    const ext = getFileExtension(file.name);
    return ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(ext);
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
      }
    } catch {
      // Error handled silently
    }
  }, [file, queryClient]);

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
      }
    } catch {
      // Error handled silently
    }
  }, [file, section, queryClient]);

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
  }, [file]);

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

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          whileHover={{ y: -2 }}
          onHoverStart={() => setIsHovered(true)}
          onHoverEnd={() => setIsHovered(false)}
        >
          <Card
            className={cn(
              "group relative cursor-pointer transition-all duration-200 border-2 overflow-hidden",
              isSelected
                ? "border-emerald-500 shadow-emerald-500/10 shadow-lg bg-emerald-500/5"
                : "border-transparent hover:border-border hover:shadow-md"
            )}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
          >
            {/* Star badge */}
            {file.starred && (
              <div className="absolute top-2 right-2 z-10">
                <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
              </div>
            )}

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

            <CardContent className="flex flex-col items-center gap-2 p-4 pb-3">
              {/* Icon / Thumbnail */}
              {isImage ? (
                <div className="mt-2 w-12 h-12 rounded-lg overflow-hidden bg-muted">
                  <img
                    src={`/api/files/download?id=${file.id}&mode=inline`}
                    alt={file.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="mt-2">
                  <FileTypeIcon file={file} className="w-12 h-12" strokeWidth={1.5} />
                </div>
              )}

              {/* File name */}
              <p className="text-sm font-medium text-center leading-tight line-clamp-2 w-full">
                {file.name}
              </p>

              {/* Meta info */}
              <p className="text-xs text-muted-foreground text-center">
                {file.type === "folder"
                  ? "Folder"
                  : `${formatFileSize(file.size)} · ${formatDate(file.updatedAt)}`}
              </p>
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
