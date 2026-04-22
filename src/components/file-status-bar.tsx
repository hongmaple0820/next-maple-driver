"use client";

import { useQuery } from "@tanstack/react-query";
import { useFileStore } from "@/store/file-store";
import { formatFileSize, matchesTypeFilter, type FileItem } from "@/lib/file-utils";
import { Folder, File, CheckCircle2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export function FileStatusBar() {
  const { currentFolderId, section, searchQuery, typeFilter, selectedFileIds } = useFileStore();
  const { t } = useI18n();

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
  const folderCount = filteredFiles.filter(f => f.type === "folder").length;
  const onlyFileCount = fileCount - folderCount;
  const totalSize = filteredFiles.reduce((sum, f) => sum + (f.size ?? 0), 0);
  const selectedCount = selectedFileIds.size;

  return (
    <div className="border-t border-border/60 bg-muted/20 backdrop-blur-sm px-4 py-2 flex items-center justify-between text-xs text-muted-foreground border-l-2 border-l-emerald-500/30 hover:text-[13px] transition-all duration-150">
      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-1.5">
          {folderCount > 0 && (
            <span className="flex items-center gap-1">
              <Folder className="w-3 h-3 text-amber-500/60" />
              {folderCount}
            </span>
          )}
          {onlyFileCount > 0 && (
            <span className="flex items-center gap-1">
              <File className="w-3 h-3 text-sky-500/60" />
              {onlyFileCount}
            </span>
          )}
          {fileCount === 0 && (
            <span>0 items</span>
          )}
        </div>
        {fileCount > 0 && (
          <>
            <span className="text-border/60">·</span>
            <span>{formatFileSize(totalSize)}</span>
          </>
        )}
      </div>
      {selectedCount > 0 && (
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10">
          <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
            {selectedCount} selected
          </span>
        </div>
      )}
    </div>
  );
}
