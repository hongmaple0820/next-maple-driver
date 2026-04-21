"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { FolderOpen, Star, Download, Pencil, FolderInput, Share2, Trash2, RotateCcw, X, ArrowUpDown } from "lucide-react";
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
import { formatFileSize, formatDate, getFileTypeLabel, matchesTypeFilter, type FileItem } from "@/lib/file-utils";
import { cn } from "@/lib/utils";

export function FileList() {
  const { currentFolderId, section, searchQuery, selectedFileIds, toggleSelect, selectAll, clearSelection, setCurrentFolderId, setDetailFile, setRenameFile, setMoveFile, setShareFile, setPreviewFile, sortBy, sortDirection, toggleSort, typeFilter } = useFileStore();
  const queryClient = useQueryClient();

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
          {file.type === "file" && (
            <DropdownMenuItem onClick={() => setShareFile({ id: file.id, name: file.name })}>
              <Share2 className="w-4 h-4" /> Share
            </DropdownMenuItem>
          )}
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
          {file.type === "file" && (
            <ContextMenuItem onClick={() => setShareFile({ id: file.id, name: file.name })}>
              <Share2 className="w-4 h-4" /> Share
            </ContextMenuItem>
          )}
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

  if (isLoading) {
    return (
      <div className="p-4 space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-12 rounded-lg bg-muted/50 animate-pulse" />
        ))}
      </div>
    );
  }

  if (sortedFiles.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-20 text-muted-foreground"
      >
        <FolderOpen className="w-16 h-16 mb-4 opacity-30" />
        <p className="text-lg font-medium">No items here</p>
        <p className="text-sm mt-1">
          {typeFilter !== "all"
            ? "No files match this filter"
            : isSearch
            ? "No files match your search"
            : section === "trash"
            ? "Trash is empty"
            : section === "starred"
            ? "No starred items"
            : section === "recent"
            ? "No recent files"
            : "Upload files or create a folder to get started"}
        </p>
      </motion.div>
    );
  }

  return (
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
          {sortedFiles.map((file) => {
            const isSelected = selectedFileIds.has(file.id);

            return (
              <ContextMenu key={file.id}>
                <ContextMenuTrigger asChild>
                  <TableRow
                    className={cn(
                      "cursor-pointer transition-colors",
                      isSelected && "bg-emerald-500/5 hover:bg-emerald-500/10"
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
