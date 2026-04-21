"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { FolderOpen, SearchX, Star, Trash2, Clock, FolderPlus, Upload, Clipboard, ArrowDownAZ, ArrowUpDown, Clock4, HardDrive, FileType2 } from "lucide-react";
import { useFileStore, type SortField } from "@/store/file-store";
import { FileCard } from "@/components/file-card";
import { getFileTypeLabel, matchesTypeFilter, type FileItem } from "@/lib/file-utils";
import { uploadFileWithProgress } from "@/lib/upload-utils";
import { Skeleton } from "@/components/ui/skeleton";
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
import { toast } from "sonner";

export function FileGrid() {
  const {
    currentFolderId, section, searchQuery, sortBy, sortDirection, typeFilter,
    selectedFileIds, selectAll, clearSelection, setCurrentFolderId, setRenameFile, setPreviewFile,
    setCreateFolderOpen, setSortBy, setSortDirection, clipboard, setClipboard,
  } = useFileStore();
  const queryClient = useQueryClient();
  const [allFileIds, setAllFileIds] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSearch = searchQuery.trim().length > 0;

  const { data: files = [], isLoading } = useQuery<FileItem[]>({
    queryKey: ["files", currentFolderId, section, searchQuery],
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
      const res = await fetch(`/api/files?${params}`);
      if (!res.ok) throw new Error("Failed to fetch files");
      return res.json();
    },
  });

  // Apply type filter first, then sort
  const filteredFiles = typeFilter === "all"
    ? files
    : files.filter((file) => matchesTypeFilter(file, typeFilter));

  const sortedFiles = [...filteredFiles].sort((a, b) => {
    // Folders always first
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;

    let cmp = 0;
    switch (sortBy) {
      case "name":
        cmp = a.name.localeCompare(b.name);
        break;
      case "updatedAt":
        cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        break;
      case "size":
        cmp = (a.size ?? 0) - (b.size ?? 0);
        break;
      case "type":
        cmp = getFileTypeLabel(a).localeCompare(getFileTypeLabel(b));
        break;
    }
    return sortDirection === "asc" ? cmp : -cmp;
  });

  // Update allFileIds whenever sorted files change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAllFileIds(sortedFiles.map(f => f.id));
  }, [files, typeFilter, sortBy, sortDirection]);

  // Upload handler for context menu
  const handleUploadFromMenu = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    for (const file of Array.from(fileList)) {
      try {
        await uploadFileWithProgress(file, currentFolderId, queryClient);
      } catch {
        // Error already shown via toast
      }
    }
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [currentFolderId, queryClient]);

  // Paste handler
  const handlePaste = useCallback(async () => {
    if (!clipboard) return;

    for (const fileId of clipboard.fileIds) {
      try {
        if (clipboard.operation === "copy") {
          const res = await fetch("/api/files/copy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: fileId, targetParentId: currentFolderId }),
          });
          if (!res.ok) toast.error("Failed to paste item");
        } else {
          // Cut = move to current folder
          const res = await fetch("/api/files/move", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: fileId, targetParentId: currentFolderId }),
          });
          if (!res.ok) toast.error("Failed to move item");
        }
      } catch {
        toast.error("Paste operation failed");
      }
    }

    queryClient.invalidateQueries({ queryKey: ["files"] });
    queryClient.invalidateQueries({ queryKey: ["storage-stats"] });

    if (clipboard.operation === "cut") {
      setClipboard(null);
    }

    toast.success(`Pasted ${clipboard.fileIds.length} item${clipboard.fileIds.length > 1 ? "s" : ""}`);
  }, [clipboard, currentFolderId, queryClient, setClipboard]);

  // Keyboard shortcut handlers
  useEffect(() => {
    const handleSelectAll = () => selectAll(allFileIds);
    const handleDeleteSelected = async () => {
      for (const id of selectedFileIds) {
        await fetch("/api/files", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, permanent: section === "trash" }),
        });
      }
      if (selectedFileIds.size > 0) {
        queryClient.invalidateQueries({ queryKey: ["files"] });
        queryClient.invalidateQueries({ queryKey: ["storage-stats"] });
        clearSelection();
      }
    };
    const handleRenameSelected = () => {
      if (selectedFileIds.size === 1) {
        const file = sortedFiles.find(f => selectedFileIds.has(f.id));
        if (file) setRenameFile({ id: file.id, name: file.name });
      }
    };
    const handleOpenSelected = () => {
      if (selectedFileIds.size === 1) {
        const file = sortedFiles.find(f => selectedFileIds.has(f.id));
        if (file) {
          if (file.type === "folder") {
            setCurrentFolderId(file.id);
          } else {
            setPreviewFile({ id: file.id, name: file.name, type: file.type, mimeType: file.mimeType });
          }
        }
      }
    };

    window.addEventListener("clouddrive:select-all", handleSelectAll);
    window.addEventListener("clouddrive:delete-selected", handleDeleteSelected);
    window.addEventListener("clouddrive:rename-selected", handleRenameSelected);
    window.addEventListener("clouddrive:open-selected", handleOpenSelected);
    window.addEventListener("clouddrive:paste", handlePaste);
    return () => {
      window.removeEventListener("clouddrive:select-all", handleSelectAll);
      window.removeEventListener("clouddrive:delete-selected", handleDeleteSelected);
      window.removeEventListener("clouddrive:rename-selected", handleRenameSelected);
      window.removeEventListener("clouddrive:open-selected", handleOpenSelected);
      window.removeEventListener("clouddrive:paste", handlePaste);
    };
  }, [allFileIds, selectedFileIds, sortedFiles, section, queryClient, selectAll, clearSelection, setRenameFile, setPreviewFile, setCurrentFolderId, handlePaste]);

  // Sort handler from context menu
  const handleSortBy = useCallback((field: SortField) => {
    setSortBy(field);
    setSortDirection("asc");
  }, [setSortBy, setSortDirection]);

  // Hidden file input for upload
  const hiddenFileInput = (
    <input
      ref={fileInputRef}
      type="file"
      multiple
      className="hidden"
      onChange={handleFileInputChange}
    />
  );

  // Context menu for empty area
  const emptyAreaContextMenu = (
    <ContextMenuContent className="w-52">
      {section === "files" && (
        <>
          <ContextMenuItem onClick={() => setCreateFolderOpen(true)}>
            <FolderPlus className="w-4 h-4" /> New Folder
          </ContextMenuItem>
          <ContextMenuItem onClick={handleUploadFromMenu}>
            <Upload className="w-4 h-4" /> Upload Files
          </ContextMenuItem>
          {clipboard && (
            <ContextMenuItem onClick={handlePaste}>
              <Clipboard className="w-4 h-4" /> Paste
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
        </>
      )}
      <ContextMenuItem onClick={() => selectAll(allFileIds)}>
        <ArrowDownAZ className="w-4 h-4" /> Select All
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <ArrowUpDown className="w-4 h-4" /> Sort by
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-40">
          <ContextMenuItem onClick={() => handleSortBy("name")}>
            <ArrowDownAZ className="w-4 h-4" /> Name
          </ContextMenuItem>
          <ContextMenuItem onClick={() => handleSortBy("updatedAt")}>
            <Clock4 className="w-4 h-4" /> Modified
          </ContextMenuItem>
          <ContextMenuItem onClick={() => handleSortBy("size")}>
            <HardDrive className="w-4 h-4" /> Size
          </ContextMenuItem>
          <ContextMenuItem onClick={() => handleSortBy("type")}>
            <FileType2 className="w-4 h-4" /> Type
          </ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>
    </ContextMenuContent>
  );

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 p-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card overflow-hidden">
            <div className="flex flex-col items-center gap-2 p-4 pb-3">
              <Skeleton className="w-14 h-14 rounded-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (sortedFiles.length === 0) {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center justify-center py-24 text-muted-foreground min-h-[300px]"
          >
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="w-20 h-20 rounded-2xl bg-muted/50 flex items-center justify-center mb-6"
            >
              {isSearch ? (
                <SearchX className="w-10 h-10 opacity-40" />
              ) : section === "trash" ? (
                <Trash2 className="w-10 h-10 opacity-40" />
              ) : section === "starred" ? (
                <Star className="w-10 h-10 opacity-40" />
              ) : section === "recent" ? (
                <Clock className="w-10 h-10 opacity-40" />
              ) : typeFilter !== "all" ? (
                <FolderOpen className="w-10 h-10 opacity-40" />
              ) : (
                <FolderOpen className="w-10 h-10 opacity-40" />
              )}
            </motion.div>
            <p className="text-lg font-medium mb-1">
              {isSearch
                ? "No results found"
                : typeFilter !== "all"
                ? "No files match this filter"
                : section === "trash"
                ? "Trash is empty"
                : section === "starred"
                ? "No starred items"
                : section === "recent"
                ? "No recent files"
                : "This folder is empty"}
            </p>
            <p className="text-sm max-w-xs text-center">
              {isSearch
                ? "Try a different search term"
                : typeFilter !== "all"
                ? "Try selecting a different file type or 'All'"
                : section === "files"
                ? "Upload files or create a folder to get started"
                : `Items you ${section === "starred" ? "star" : section === "trash" ? "delete" : "modify"} will appear here`}
            </p>
          </motion.div>
        </ContextMenuTrigger>
        {emptyAreaContextMenu}
        {hiddenFileInput}
      </ContextMenu>
    );
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 p-4"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); }}
        >
          {sortedFiles.map((file, index) => (
            <motion.div
              key={file.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: index * 0.03 }}
            >
              <FileCard file={file} />
            </motion.div>
          ))}
        </div>
      </ContextMenuTrigger>
      {emptyAreaContextMenu}
      {hiddenFileInput}
    </ContextMenu>
  );
}
