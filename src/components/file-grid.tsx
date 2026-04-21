"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { FolderOpen, SearchX, Star, Trash2, Clock } from "lucide-react";
import { useFileStore } from "@/store/file-store";
import { FileCard } from "@/components/file-card";
import { getFileTypeLabel, matchesTypeFilter, type FileItem } from "@/lib/file-utils";

export function FileGrid() {
  const { currentFolderId, section, searchQuery, sortBy, sortDirection, typeFilter, selectedFileIds, selectAll, clearSelection, setCurrentFolderId, setRenameFile, setPreviewFile } = useFileStore();
  const queryClient = useQueryClient();
  const [allFileIds, setAllFileIds] = useState<string[]>([]);

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
    return () => {
      window.removeEventListener("clouddrive:select-all", handleSelectAll);
      window.removeEventListener("clouddrive:delete-selected", handleDeleteSelected);
      window.removeEventListener("clouddrive:rename-selected", handleRenameSelected);
      window.removeEventListener("clouddrive:open-selected", handleOpenSelected);
    };
  }, [allFileIds, selectedFileIds, sortedFiles, section, queryClient, selectAll, clearSelection, setRenameFile, setPreviewFile, setCurrentFolderId]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 p-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="h-40 rounded-xl bg-muted/50 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (sortedFiles.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col items-center justify-center py-24 text-muted-foreground"
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
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 p-4">
      {sortedFiles.map((file) => (
        <FileCard key={file.id} file={file} />
      ))}
    </div>
  );
}
