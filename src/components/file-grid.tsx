"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { FolderOpen, SearchX, Star, Trash2, Clock, FolderPlus, Upload, Clipboard, ArrowDownAZ, ArrowUpDown, Clock4, HardDrive, FileType2, Pencil } from "lucide-react";
import { useFileStore, type SortField } from "@/store/file-store";
import { FileCard } from "@/components/file-card";
import { getFileTypeLabel, matchesTypeFilter, type FileItem } from "@/lib/file-utils";
import { uploadFileWithProgress } from "@/lib/upload-utils";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
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
import { useI18n } from "@/lib/i18n";

export function FileGrid() {
  const {
    currentFolderId, section, searchQuery, sortBy, sortDirection, typeFilter,
    selectedFileIds, selectAll, clearSelection, setCurrentFolderId, setRenameFile, setPreviewFile,
    setCreateFolderOpen, setSortBy, setSortDirection, clipboard, setClipboard, setSearchResultCount,
    compactMode, showExtensions, setBatchRenameOpen, colorLabelFilter,
    setCrossDriverMoveOpen, setCrossDriverMoveFileIds,
  } = useFileStore();
  const queryClient = useQueryClient();
  const { t } = useI18n();
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

  // Apply type filter, then color label filter, then sort
  const typeFilteredFiles = typeFilter === "all"
    ? files
    : files.filter((file) => matchesTypeFilter(file, typeFilter));

  const filteredFiles = !colorLabelFilter
    ? typeFilteredFiles
    : typeFilteredFiles.filter((file) => file.colorLabel === colorLabelFilter || file.type === "folder");

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
  }, [files, typeFilter, colorLabelFilter, sortBy, sortDirection]);

  // Update search result count
  useEffect(() => {
    if (searchQuery.trim()) {
      setSearchResultCount(sortedFiles.length);
    } else {
      setSearchResultCount(0);
    }
  }, [searchQuery, sortedFiles.length, setSearchResultCount]);

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

    toast.success(`${t.app.pasted} ${clipboard.fileIds.length} ${t.app.items}`);
  }, [clipboard, currentFolderId, queryClient, setClipboard, t]);

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
            <FolderPlus className="w-4 h-4" /> {t.app.newFolder}
          </ContextMenuItem>
          <ContextMenuItem onClick={handleUploadFromMenu}>
            <Upload className="w-4 h-4" /> {t.app.uploadFiles}
          </ContextMenuItem>
          {clipboard && (
            <ContextMenuItem onClick={handlePaste}>
              <Clipboard className="w-4 h-4" /> {t.app.paste}
            </ContextMenuItem>
          )}
          {selectedFileIds.size > 1 && section !== "trash" && (
            <ContextMenuItem onClick={() => setBatchRenameOpen(true)}>
              <Pencil className="w-4 h-4" /> {t.app.batchRename}
            </ContextMenuItem>
          )}
          {selectedFileIds.size > 0 && section !== "trash" && (
            <ContextMenuItem onClick={() => { setCrossDriverMoveFileIds(Array.from(selectedFileIds)); setCrossDriverMoveOpen(true); }}>
              <HardDrive className="w-4 h-4" /> {t.app.crossDriverTransfer}
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
        </>
      )}
      <ContextMenuItem onClick={() => selectAll(allFileIds)}>
        <ArrowDownAZ className="w-4 h-4" /> {t.app.selectAll}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <ArrowUpDown className="w-4 h-4" /> {t.app.sortBy}
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-40">
          <ContextMenuItem onClick={() => handleSortBy("name")}>
            <ArrowDownAZ className="w-4 h-4" /> {t.app.name}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => handleSortBy("updatedAt")}>
            <Clock4 className="w-4 h-4" /> {t.app.modified}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => handleSortBy("size")}>
            <HardDrive className="w-4 h-4" /> {t.app.size}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => handleSortBy("type")}>
            <FileType2 className="w-4 h-4" /> {t.app.type}
          </ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>
    </ContextMenuContent>
  );

  if (isLoading) {
    return (
      <div className={cn(
        "grid gap-4 p-4",
        compactMode
          ? "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7"
          : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
      )}>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className={cn("rounded-xl border bg-card overflow-hidden", compactMode && "rounded-lg")}>
            <div className={cn("flex flex-col items-center gap-2", compactMode ? "p-2 pb-1.5" : "p-4 pb-3")}>
              <Skeleton className={compactMode ? "w-8 h-8 rounded-full" : "w-14 h-14 rounded-full"} />
              <Skeleton className="h-4 w-3/4" />
              {!compactMode && <Skeleton className="h-3 w-1/2" />}
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
              className={cn(
                "w-24 h-24 rounded-3xl flex items-center justify-center mb-6",
                isSearch ? "bg-sky-500/10" :
                section === "trash" ? "bg-red-500/10" :
                section === "starred" ? "bg-amber-500/10" :
                section === "recent" ? "bg-purple-500/10" :
                "bg-muted/50"
              )}
            >
              {isSearch ? (
                <SearchX className="w-12 h-12 text-sky-500/60" />
              ) : section === "trash" ? (
                <div className="relative">
                  <Trash2 className="w-12 h-12 text-emerald-500/60" />
                  <svg className="absolute -bottom-1 -right-1 w-6 h-6 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              ) : section === "starred" ? (
                <div className="relative">
                  <Star className="w-12 h-12 text-amber-500/60" />
                  <div className="absolute -bottom-0.5 -right-1 w-4 h-4 rounded-full bg-amber-500/20 flex items-center justify-center">
                    <span className="text-[8px] text-amber-600 font-bold">?</span>
                  </div>
                </div>
              ) : section === "recent" ? (
                <Clock className="w-12 h-12 text-purple-500/60" />
              ) : typeFilter !== "all" || colorLabelFilter ? (
                <FolderOpen className="w-12 h-12 opacity-40" />
              ) : (
                <FolderOpen className="w-12 h-12 opacity-40" />
              )}
            </motion.div>
            <p className="text-lg font-semibold mb-1">
              {isSearch
                ? t.app.noResultsFound
                : typeFilter !== "all" || colorLabelFilter
                ? t.app.noFilesMatchFilter
                : section === "trash"
                ? t.app.trashIsEmpty
                : section === "starred"
                ? t.app.noStarredItems
                : section === "recent"
                ? t.app.noRecentFiles
                : t.app.folderIsEmpty}
            </p>
            <p className="text-sm max-w-xs text-center text-muted-foreground/70">
              {isSearch
                ? t.app.tryDifferentSearch
                : typeFilter !== "all" || colorLabelFilter
                ? t.app.tryDifferentFilter
                : section === "trash"
                ? t.app.deletedItemsAppearHere
                : section === "files"
                ? t.app.uploadOrCreate
                : section === "starred"
                ? t.app.starredItemsAppearHere
                : t.app.modifiedItemsAppearHere}
            </p>
            {/* Quick action hint */}
            {section === "starred" && !isSearch && !typeFilter && (
              <p className="text-xs text-muted-foreground/50 mt-2 flex items-center gap-1">
                <Star className="w-3 h-3" /> Right-click any file to star it
              </p>
            )}
            {section === "trash" && !isSearch && !typeFilter && (
              <p className="text-xs text-emerald-600/60 mt-2">Files deleted from here are gone forever</p>
            )}
            {isSearch && (
              <p className="text-xs text-sky-500/50 mt-2 flex items-center gap-1">
                <SearchX className="w-3 h-3" /> Try different keywords or clear filters
              </p>
            )}
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
          className={cn(
            "grid gap-4 p-4",
            compactMode
              ? "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7"
              : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
          )}
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
