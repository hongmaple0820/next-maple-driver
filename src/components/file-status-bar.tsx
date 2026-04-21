"use client";

import { useQuery } from "@tanstack/react-query";
import { useFileStore } from "@/store/file-store";
import { formatFileSize, matchesTypeFilter, type FileItem } from "@/lib/file-utils";

export function FileStatusBar() {
  const { currentFolderId, section, searchQuery, typeFilter, selectedFileIds } = useFileStore();

  const isSearch = searchQuery.trim().length > 0;

  const { data: files = [] } = useQuery<FileItem[]>({
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

  const filteredFiles = typeFilter === "all"
    ? files
    : files.filter((file) => matchesTypeFilter(file, typeFilter));

  const fileCount = filteredFiles.length;
  const totalSize = filteredFiles.reduce((sum, f) => sum + (f.size ?? 0), 0);
  const selectedCount = selectedFileIds.size;

  return (
    <div className="border-t border-border bg-muted/30 px-4 py-1.5 flex items-center justify-between text-xs text-muted-foreground">
      <div className="flex items-center gap-3">
        <span>{fileCount} item{fileCount !== 1 ? "s" : ""}</span>
        <span>·</span>
        <span>{formatFileSize(totalSize)}</span>
      </div>
      {selectedCount > 0 && (
        <div className="flex items-center gap-1">
          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
            {selectedCount} selected
          </span>
        </div>
      )}
    </div>
  );
}
