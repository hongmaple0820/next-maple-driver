"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Folder,
  Image,
  Film,
  Music,
  FileText,
  FileCode,
  Archive,
  File,
  ChevronRight,
  Star,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFileStore, type FileTypeFilter } from "@/store/file-store";
import {
  getFileIcon,
  getFileIconColor,
  formatFileSize,
  formatRelativeTime,
  type FileItem,
} from "@/lib/file-utils";
import { useI18n } from "@/lib/i18n";

interface SearchResponse {
  results: FileItem[];
  counts: Record<string, number>;
  total: number;
  query: string;
  filters: {
    type: string | null;
    date: string | null;
    size: string | null;
  };
}

interface SearchResultItem {
  id: string;
  name: string;
  type: string;
  size: number;
  mimeType: string;
  parentId: string;
  starred: boolean;
  trashed: boolean;
  colorLabel: string;
  driverId: string | null;
  createdAt: string;
  updatedAt: string;
  childrenCount: number;
}

// Type group labels and icons
const TYPE_GROUPS: Record<string, { labelKey: string; icon: React.ComponentType<{ className?: string }> }> = {
  folders: { labelKey: "folders", icon: Folder },
  images: { labelKey: "filterImages", icon: Image },
  videos: { labelKey: "filterVideos", icon: Film },
  audio: { labelKey: "filterAudio", icon: Music },
  documents: { labelKey: "filterDocs", icon: FileText },
  code: { labelKey: "filterCode", icon: FileCode },
  archives: { labelKey: "filterArchives", icon: Archive },
  other: { labelKey: "other", icon: File },
};

// Highlight matched text in file names
function HighlightedText({
  text,
  query,
}: {
  text: string;
  query: string;
}) {
  if (!query.trim()) return <>{text}</>;

  const regex = new RegExp(
    `(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
    "gi"
  );
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-emerald-500/20 text-foreground rounded px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

// File path breadcrumb component
function FilePathBreadcrumb({ parentId }: { parentId: string }) {
  const { data: path = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["search-path", parentId],
    queryFn: async () => {
      if (parentId === "root") return [];
      const res = await fetch(`/api/files/path?id=${parentId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: parentId !== "root",
    staleTime: 60000,
  });

  if (parentId === "root" || path.length === 0) return null;

  return (
    <div className="flex items-center gap-0.5 text-[11px] text-muted-foreground truncate max-w-[250px]">
      {path.slice(0, 3).map((p, i) => (
        <span key={p.id} className="flex items-center gap-0.5 truncate">
          {i > 0 && <ChevronRight className="w-2.5 h-2.5 shrink-0" />}
          <span className="truncate">{p.name}</span>
        </span>
      ))}
      {path.length > 3 && <span>...</span>}
    </div>
  );
}

interface SearchResultsPanelProps {
  query: string;
  typeFilter: string;
  dateFilter: string;
  sizeFilter: string;
  onFileClick: (file: SearchResultItem) => void;
  onClearFilters: () => void;
}

export function SearchResultsPanel({
  query,
  typeFilter,
  dateFilter,
  sizeFilter,
  onFileClick,
  onClearFilters,
}: SearchResultsPanelProps) {
  const { t } = useI18n();
  const { setCurrentFolderId, setSection } = useFileStore();
  const [activeTab, setActiveTab] = useState<string>("all");

  // Build search params
  const searchParams = new URLSearchParams();
  if (query.trim()) searchParams.set("q", query.trim());
  if (typeFilter) searchParams.set("type", typeFilter);
  if (dateFilter) searchParams.set("date", dateFilter);
  if (sizeFilter) searchParams.set("size", sizeFilter);
  searchParams.set("group", "type");

  const {
    data: searchData,
    isLoading,
    error,
  } = useQuery<SearchResponse>({
    queryKey: [
      "search-advanced",
      query,
      typeFilter,
      dateFilter,
      sizeFilter,
    ],
    queryFn: async () => {
      const res = await fetch(`/api/files/search?${searchParams.toString()}`);
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: query.trim().length > 0 || !!typeFilter || !!dateFilter || !!sizeFilter,
    staleTime: 5000,
  });

  const results = searchData?.results || [];
  const counts = searchData?.counts || {};
  const total = searchData?.total || 0;
  const activeFilters = searchData?.filters || {};

  // Filter results by active tab
  const filteredResults = useCallback(() => {
    if (activeTab === "all") return results;
    if (activeTab === "folders") {
      return results.filter((f) => f.type === "folder");
    }
    return results.filter((f) => {
      if (f.type === "folder") return false;
      // Use the same matching logic as backend
      const mime = (f.mimeType || "").toLowerCase();
      const name = f.name;
      const ext = name.includes(".")
        ? name.split(".").pop()?.toLowerCase() || ""
        : "";

      switch (activeTab) {
        case "images":
          return (
            mime.startsWith("image/") ||
            ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"].includes(ext)
          );
        case "videos":
          return (
            mime.startsWith("video/") ||
            ["mp4", "webm", "avi", "mov", "mkv", "flv"].includes(ext)
          );
        case "audio":
          return (
            mime.startsWith("audio/") ||
            ["mp3", "wav", "ogg", "flac", "aac", "m4a"].includes(ext)
          );
        case "documents":
          return (
            mime.includes("document") ||
            mime.includes("word") ||
            mime.includes("pdf") ||
            mime.includes("text/plain") ||
            mime.includes("spreadsheet") ||
            ["doc", "docx", "pdf", "txt", "rtf", "xls", "xlsx", "csv"].includes(ext)
          );
        case "code":
          return (
            mime.includes("json") ||
            mime.includes("javascript") ||
            mime.includes("typescript") ||
            ["js", "ts", "tsx", "jsx", "py", "rb", "go", "rs", "java", "c", "cpp", "html", "css", "md"].includes(ext)
          );
        case "archives":
          return (
            mime.includes("zip") ||
            mime.includes("rar") ||
            mime.includes("tar") ||
            ["zip", "rar", "tar", "gz", "7z"].includes(ext)
          );
        default:
          return true;
      }
    });
  }, [results, activeTab]);

  const displayResults = filteredResults();

  const handleResultClick = (file: SearchResultItem) => {
    if (file.type === "folder") {
      setSection("files");
      setCurrentFolderId(file.id);
      onClearFilters();
    } else {
      onFileClick(file);
    }
  };

  // Build active filter badges
  const activeFilterBadges = [];
  if (activeFilters.type) {
    const group = TYPE_GROUPS[activeFilters.type];
    if (group) {
      const label =
        t.app[
          group.labelKey as keyof typeof t.app
        ];
      activeFilterBadges.push({ key: "type", label: label as string });
    }
  }
  if (activeFilters.date) {
    const dateLabels: Record<string, string> = {
      today: t.app.searchToday,
      week: t.app.searchThisWeek,
      month: t.app.searchThisMonth,
      year: t.app.searchThisYear,
    };
    activeFilterBadges.push({
      key: "date",
      label: dateLabels[activeFilters.date] || activeFilters.date,
    });
  }
  if (activeFilters.size) {
    const sizeLabels: Record<string, string> = {
      small: t.app.searchSmallFiles,
      medium: t.app.searchMediumFiles,
      large: t.app.searchLargeFiles,
    };
    activeFilterBadges.push({
      key: "size",
      label: sizeLabels[activeFilters.size] || activeFilters.size,
    });
  }

  const hasActiveSearch = query.trim().length > 0 || !!typeFilter || !!dateFilter || !!sizeFilter;

  if (!hasActiveSearch) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="border-t border-border/60 bg-background/50"
    >
      {/* Header with counts and filter badges */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border/40">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {isLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
          ) : (
            <span className="text-sm font-medium">
              {total} {t.app.resultsFound}
            </span>
          )}

          {/* Active filter badges */}
          {activeFilterBadges.map((badge) => (
            <span
              key={badge.key}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/20"
            >
              {badge.label}
            </span>
          ))}
        </div>
      </div>

      {/* Type filter tabs */}
      {total > 0 && (
        <div className="flex items-center gap-1 px-4 py-1.5 border-b border-border/30 overflow-x-auto">
          <button
            onClick={() => setActiveTab("all")}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all whitespace-nowrap",
              activeTab === "all"
                ? "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/20"
                : "text-muted-foreground hover:bg-accent/50"
            )}
          >
            {t.app.filterAll}
            <span className="text-[10px] opacity-70">{total}</span>
          </button>
          {Object.entries(TYPE_GROUPS).map(([key, group]) => {
            const count = counts[key] || 0;
            if (count === 0) return null;
            const Icon = group.icon;
            const label = t.app[group.labelKey as keyof typeof t.app];
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all whitespace-nowrap",
                  activeTab === key
                    ? "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/20"
                    : "text-muted-foreground hover:bg-accent/50"
                )}
              >
                <Icon className="w-3 h-3" />
                {label as string}
                <span className="text-[10px] opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Results list */}
      <div className="max-h-72 overflow-y-auto custom-scrollbar">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">
              {t.app.searching}
            </span>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-sm text-destructive">
              {t.app.searchFailed}
            </span>
          </div>
        ) : displayResults.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-sm text-muted-foreground">
              {t.app.noResultsFound}
            </span>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {displayResults.slice(0, 50).map((file, index) => {
              const fileItem: FileItem = {
                id: file.id,
                name: file.name,
                type: file.type as "folder" | "file",
                mimeType: file.mimeType,
                size: file.size,
                parentId: file.parentId,
                starred: file.starred,
                trashed: file.trashed,
                createdAt: file.createdAt,
                updatedAt: file.updatedAt,
                childrenCount: file.childrenCount,
                colorLabel: file.colorLabel,
                driverId: file.driverId,
              };
              const Icon = getFileIcon(fileItem);
              const iconColor = getFileIconColor(fileItem);

              return (
                <motion.button
                  key={file.id}
                  layout
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.12, delay: Math.min(index * 0.02, 0.3) }}
                  className="w-full flex items-center gap-3 px-4 py-2 hover:bg-accent/50 transition-colors text-left group"
                  onClick={() => handleResultClick(file)}
                >
                  <Icon className={cn("w-4 h-4 shrink-0", iconColor)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm truncate">
                        <HighlightedText text={file.name} query={query} />
                      </span>
                      {file.starred && (
                        <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
                      )}
                    </div>
                    <FilePathBreadcrumb parentId={file.parentId} />
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-[11px] text-muted-foreground">
                    {file.type === "file" && (
                      <span>{formatFileSize(file.size)}</span>
                    )}
                    <span>{formatRelativeTime(file.updatedAt)}</span>
                  </div>
                </motion.button>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </motion.div>
  );
}
