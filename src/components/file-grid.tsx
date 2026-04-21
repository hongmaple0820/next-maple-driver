"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { FolderOpen } from "lucide-react";
import { useFileStore } from "@/store/file-store";
import { FileCard } from "@/components/file-card";
import { getFileTypeLabel, matchesTypeFilter, type FileItem } from "@/lib/file-utils";

export function FileGrid() {
  const { currentFolderId, section, searchQuery, sortBy, sortDirection, typeFilter } = useFileStore();

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
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-20 text-muted-foreground"
      >
        <FolderOpen className="w-16 h-16 mb-4 opacity-30" />
        <p className="text-lg font-medium">No items here</p>
        <p className="text-sm mt-1">
          {isSearch
            ? "No files match your search"
            : typeFilter !== "all"
            ? "No files match this filter"
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
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 p-4">
      {sortedFiles.map((file) => (
        <FileCard key={file.id} file={file} />
      ))}
    </div>
  );
}
