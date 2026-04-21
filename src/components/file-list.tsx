"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { FolderOpen, SearchX, Star, Download, Pencil, FolderInput, Share2, Trash2, RotateCcw, X, ArrowUpDown, Clock, Copy, FolderPlus, Upload, Clipboard, ArrowDownAZ, Clock4, HardDrive, FileType2, Info } from "lucide-react";
import { useFileStore, type SortField } from "@/store/file-store";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
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
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { FileTypeIcon } from "@/components/file-type-icon";
import { formatFileSize, formatDate, getFileTypeLabel, matchesTypeFilter, type FileItem } from "@/lib/file-utils";
import { uploadFileWithProgress } from "@/lib/upload-utils";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function FileList() {
  const {
    currentFolderId, section, searchQuery, selectedFileIds, toggleSelect, selectAll,
    clearSelection, setCurrentFolderId, setDetailFile, setRenameFile, setMoveFile,
    setShareFile, setPreviewFile, sortBy, sortDirection, toggleSort, typeFilter,
    setCreateFolderOpen, setSortBy, setSortDirection, clipboard, setClipboard,
    setPropertiesFile,
  } = useFileStore();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drag-and-drop state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

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
    // Folders first
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;

    let cmp = 0;
    if (sortBy === "name") cmp = a.name.localeCompare(b.name);
    else if (sortBy === "size") cmp = (a.size ?? 0) - (b.size ?? 0);
    else if (sortBy === "type") cmp = getFileTypeLabel(a).localeCompare(getFileTypeLabel(b));
    else if (sortBy === "updatedAt") cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();

    return sortDirection === "asc" ? cmp : -cmp;
  });

  const handleSort = (key: SortField) => {
    toggleSort(key);
  };

  const allSelected = filteredFiles.length > 0 && filteredFiles.every((f) => selectedFileIds.has(f.id));

  const handleStar = useCallback(async (file: FileItem) => {
    try {
      const res = await fetch("/api/files/star", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: file.id, starred: !file.starred }),
      });
      if (res.ok) queryClient.invalidateQueries({ queryKey: ["files"] });
    } catch { /* silent */ }
  }, [queryClient]);

  const handleDelete = useCallback(async (file: FileItem) => {
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
    } catch { /* silent */ }
  }, [section, queryClient]);

  const handleRestore = useCallback(async (file: FileItem) => {
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
    } catch { /* silent */ }
  }, [queryClient]);

  const handleCopy = useCallback(async (file: FileItem) => {
    try {
      const res = await fetch("/api/files/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: file.id }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["files"] });
        queryClient.invalidateQueries({ queryKey: ["storage-stats"] });
      }
    } catch { /* silent */ }
  }, [queryClient]);

  const handleDownload = useCallback((file: FileItem) => {
    window.open(`/api/files/download?id=${file.id}`, "_blank");
  }, []);

  const handleRowClick = useCallback((file: FileItem) => {
    if (file.type === "folder") {
      setCurrentFolderId(file.id);
    } else {
      setDetailFile(file);
    }
  }, [setCurrentFolderId, setDetailFile]);

  const handleRowDoubleClick = useCallback((file: FileItem) => {
    if (file.type === "folder") {
      setCurrentFolderId(file.id);
    } else {
      setPreviewFile({ id: file.id, name: file.name, type: file.type, mimeType: file.mimeType, url: file.url });
    }
  }, [setCurrentFolderId, setPreviewFile]);

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

  // Listen for paste custom event from global keyboard shortcuts
  useEffect(() => {
    const handler = () => handlePaste();
    window.addEventListener("clouddrive:paste", handler);
    return () => window.removeEventListener("clouddrive:paste", handler);
  }, [handlePaste]);

  // Sort handler from context menu
  const handleSortBy = useCallback((field: SortField) => {
    setSortBy(field);
    setSortDirection("asc");
  }, [setSortBy, setSortDirection]);

  // Drag-and-drop handlers
  const handleRowDragStart = useCallback((e: React.DragEvent, file: FileItem) => {
    e.dataTransfer.setData("text/plain", file.id);
    e.dataTransfer.effectAllowed = "move";
    setDraggingId(file.id);
  }, []);

  const handleRowDragEnd = useCallback(() => {
    setDraggingId(null);
    setDragOverId(null);
  }, []);

  const handleRowDragOver = useCallback((e: React.DragEvent, file: FileItem) => {
    if (file.type === "folder") {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      setDragOverId(file.id);
    }
  }, []);

  const handleRowDragLeave = useCallback((e: React.DragEvent) => {
    e.stopPropagation();
    setDragOverId(null);
  }, []);

  const handleRowDrop = useCallback(async (e: React.DragEvent, file: FileItem) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverId(null);

    const draggedFileId = e.dataTransfer.getData("text/plain");
    if (!draggedFileId || draggedFileId === file.id) return;
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
  }, [queryClient]);

  const getActionItems = (file: FileItem) => {
    if (section !== "trash") {
      return (
        <>
          {file.type === "file" && (
            <DropdownMenuItem onClick={() => handleDownload(file)}>
              <Download className="w-4 h-4" /> Download
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setRenameFile({ id: file.id, name: file.name })}>
            <Pencil className="w-4 h-4" /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleStar(file)}>
            <Star className={cn("w-4 h-4", file.starred && "fill-yellow-400 text-yellow-400")} />
            {file.starred ? "Unstar" : "Star"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMoveFile({ id: file.id, name: file.name, parentId: file.parentId })}>
            <FolderInput className="w-4 h-4" /> Move to...
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleCopy(file)}>
            <Copy className="w-4 h-4" /> Copy
          </DropdownMenuItem>
          {file.type === "file" && (
            <DropdownMenuItem onClick={() => setShareFile({ id: file.id, name: file.name })}>
              <Share2 className="w-4 h-4" /> Share
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setPropertiesFile({ id: file.id, name: file.name })}>
            <Info className="w-4 h-4" /> Properties
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => handleDelete(file)}>
            <Trash2 className="w-4 h-4" /> Move to Trash
          </DropdownMenuItem>
        </>
      );
    }
    return (
      <>
        <DropdownMenuItem onClick={() => handleRestore(file)}>
          <RotateCcw className="w-4 h-4" /> Restore
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => handleDelete(file)}>
          <X className="w-4 h-4" /> Delete Permanently
        </DropdownMenuItem>
      </>
    );
  };

  const getContextItems = (file: FileItem) => {
    if (section !== "trash") {
      return (
        <>
          {file.type === "folder" && (
            <ContextMenuItem onClick={() => setCurrentFolderId(file.id)}>
              <FolderInput className="w-4 h-4" /> Open
            </ContextMenuItem>
          )}
          {file.type === "file" && (
            <ContextMenuItem onClick={() => handleDownload(file)}>
              <Download className="w-4 h-4" /> Download
            </ContextMenuItem>
          )}
          <ContextMenuItem onClick={() => setRenameFile({ id: file.id, name: file.name })}>
            <Pencil className="w-4 h-4" /> Rename
          </ContextMenuItem>
          <ContextMenuItem onClick={() => handleStar(file)}>
            <Star className={cn("w-4 h-4", file.starred && "fill-yellow-400 text-yellow-400")} />
            {file.starred ? "Unstar" : "Star"}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => setMoveFile({ id: file.id, name: file.name, parentId: file.parentId })}>
            <FolderInput className="w-4 h-4" /> Move to...
          </ContextMenuItem>
          <ContextMenuItem onClick={() => handleCopy(file)}>
            <Copy className="w-4 h-4" /> Copy
          </ContextMenuItem>
          {file.type === "file" && (
            <ContextMenuItem onClick={() => setShareFile({ id: file.id, name: file.name })}>
              <Share2 className="w-4 h-4" /> Share
            </ContextMenuItem>
          )}
          <ContextMenuItem onClick={() => setPropertiesFile({ id: file.id, name: file.name })}>
            <Info className="w-4 h-4" /> Properties
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onClick={() => handleDelete(file)}>
            <Trash2 className="w-4 h-4" /> Move to Trash
          </ContextMenuItem>
        </>
      );
    }
    return (
      <>
        <ContextMenuItem onClick={() => handleRestore(file)}>
          <RotateCcw className="w-4 h-4" /> Restore
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={() => handleDelete(file)}>
          <X className="w-4 h-4" /> Delete Permanently
        </ContextMenuItem>
      </>
    );
  };

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
      <ContextMenuItem onClick={() => selectAll(sortedFiles.map(f => f.id))}>
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

  if (isLoading) {
    return (
      <div className="px-4 pb-4 space-y-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-2 px-2">
            <Skeleton className="w-5 h-5 shrink-0 rounded" />
            <Skeleton className="h-4 w-[40%]" />
            <Skeleton className="h-4 w-16 hidden md:block" />
            <Skeleton className="h-4 w-12 hidden sm:block" />
            <Skeleton className="h-4 w-20 hidden lg:block" />
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
            <div className="w-20 h-20 rounded-2xl bg-muted/50 flex items-center justify-center mb-6">
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
            </div>
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
        <div className="px-4 pb-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked) => {
                      if (checked) selectAll(filteredFiles.map((f) => f.id));
                      else clearSelection();
                    }}
                  />
                </TableHead>
                <TableHead>
                  <Button variant="ghost" size="sm" className="h-8 -ml-3 gap-1" onClick={() => handleSort("name")}>
                    Name {sortBy === "name" && <ArrowUpDown className={cn("w-3 h-3 transition-transform", sortDirection === "desc" && "rotate-180")} />}
                  </Button>
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  <Button variant="ghost" size="sm" className="h-8 -ml-3 gap-1" onClick={() => handleSort("size")}>
                    Size {sortBy === "size" && <ArrowUpDown className={cn("w-3 h-3 transition-transform", sortDirection === "desc" && "rotate-180")} />}
                  </Button>
                </TableHead>
                <TableHead className="hidden sm:table-cell">
                  <Button variant="ghost" size="sm" className="h-8 -ml-3 gap-1" onClick={() => handleSort("type")}>
                    Type {sortBy === "type" && <ArrowUpDown className={cn("w-3 h-3 transition-transform", sortDirection === "desc" && "rotate-180")} />}
                  </Button>
                </TableHead>
                <TableHead className="hidden lg:table-cell">
                  <Button variant="ghost" size="sm" className="h-8 -ml-3 gap-1" onClick={() => handleSort("updatedAt")}>
                    Modified {sortBy === "updatedAt" && <ArrowUpDown className={cn("w-3 h-3 transition-transform", sortDirection === "desc" && "rotate-180")} />}
                  </Button>
                </TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedFiles.map((file, index) => {
                const isSelected = selectedFileIds.has(file.id);
                const isDragging = draggingId === file.id;
                const isDragOver = dragOverId === file.id && file.type === "folder";

                return (
                  <ContextMenu key={file.id}>
                    <ContextMenuTrigger asChild>
                      <TableRow
                        draggable
                        onDragStart={(e) => handleRowDragStart(e, file)}
                        onDragEnd={handleRowDragEnd}
                        onDragOver={(e) => handleRowDragOver(e, file)}
                        onDragLeave={handleRowDragLeave}
                        onDrop={(e) => handleRowDrop(e, file)}
                        className={cn(
                          "cursor-pointer transition-colors duration-150",
                          isDragging && "opacity-50",
                          isDragOver
                            ? "border-l-[3px] border-l-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/15"
                            : isSelected
                            ? "bg-emerald-500/5 hover:bg-emerald-500/10 border-l-[3px] border-l-emerald-500"
                            : "border-l-[3px] border-l-transparent hover:bg-muted/50",
                          index % 2 === 1 && !isSelected && !isDragOver && "bg-muted/20 hover:bg-muted/40"
                        )}
                        onClick={() => handleRowClick(file)}
                        onDoubleClick={() => handleRowDoubleClick(file)}
                      >
                        <TableCell>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelect(file.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 min-w-0">
                            <FileTypeIcon file={file} className="w-5 h-5 shrink-0" />
                            <span className="truncate font-medium text-sm">{file.name}</span>
                            {file.starred && <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400 shrink-0" />}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                          {file.type === "folder" ? "—" : formatFileSize(file.size)}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                          {getFileTypeLabel(file)}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                          {formatDate(file.updatedAt)}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVerticalIcon className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              {getActionItems(file)}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-48">
                      {getContextItems(file)}
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </ContextMenuTrigger>
      {emptyAreaContextMenu}
      {hiddenFileInput}
    </ContextMenu>
  );
}

// Separate icon to avoid inline SVG component creation
function MoreVerticalIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" />
    </svg>
  );
}
