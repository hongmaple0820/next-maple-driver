"use client";

import { useRef, useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Search, LayoutGrid, List, Upload, FolderPlus, ChevronRight, Trash2, ArrowUpDown, Image, Film, Music, FileText, FileCode, Archive, Keyboard, X } from "lucide-react";
import { useFileStore, type SortField, type FileTypeFilter } from "@/store/file-store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MobileMenuButton } from "@/components/file-sidebar";
import { uploadFilesWithProgress } from "@/lib/upload-utils";
import type { StorageStats } from "@/lib/file-utils";
import { ActivityPanel } from "@/components/activity-panel";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import type { BreadcrumbItem as BreadcrumbPathItem } from "@/lib/file-utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function FileToolbar() {
  const {
    currentFolderId,
    setCurrentFolderId,
    section,
    viewMode,
    setViewMode,
    searchQuery,
    setSearchQuery,
    searchResultCount,
    setCreateFolderOpen,
    sortBy,
    setSortBy,
    sortDirection,
    setSortDirection,
    typeFilter,
    setTypeFilter,
    setShortcutsOpen,
  } = useFileStore();

  const queryClient = useQueryClient();
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [searchInputValue, setSearchInputValue] = useState("");

  // Fetch storage stats (for trash count)
  const { data: stats } = useQuery<StorageStats>({
    queryKey: ["storage-stats"],
    queryFn: async () => {
      const res = await fetch("/api/files/stats");
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    refetchInterval: 30000,
  });

  // Fetch breadcrumb path
  const { data: breadcrumbs = [] } = useQuery<BreadcrumbPathItem[]>({
    queryKey: ["breadcrumb", currentFolderId],
    queryFn: async () => {
      if (currentFolderId === "root") return [];
      const res = await fetch(`/api/files/path?id=${currentFolderId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: currentFolderId !== "root",
  });

  const handleSearch = useCallback(
    (value: string) => {
      setSearchInputValue(value);
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = setTimeout(() => {
        setSearchQuery(value);
      }, 300);
    },
    [setSearchQuery]
  );

  const handleClearSearch = useCallback(() => {
    setSearchInputValue("");
    setSearchQuery("");
  }, [setSearchQuery]);

  const handleUploadClick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;
      await uploadFilesWithProgress(files, currentFolderId, queryClient);
    };
    input.click();
  };

  const sectionLabels: Record<string, string> = {
    files: "All Files",
    recent: "Recent",
    starred: "Starred",
    trash: "Trash",
  };

  const isSearchActive = searchQuery.trim().length > 0;

  return (
    <div className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/* Top row: hamburger + breadcrumb + search */}
      <div className="flex items-center gap-2 px-4 py-3">
        <MobileMenuButton />

        {/* Breadcrumb with animations */}
        <div className="flex-1 min-w-0">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                {currentFolderId === "root" ? (
                  <BreadcrumbPage className="font-bold text-foreground">
                    {sectionLabels[section]}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    className="cursor-pointer font-medium rounded-md px-1.5 py-0.5 -mx-1.5 transition-colors hover:bg-accent/50"
                    onClick={() => setCurrentFolderId("root")}
                  >
                    {sectionLabels[section]}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              <AnimatePresence mode="popLayout">
                {breadcrumbs.map((crumb, idx) => {
                  const isLast = idx === breadcrumbs.length - 1;
                  return (
                    <motion.span
                      key={crumb.id}
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ duration: 0.15 }}
                      className="flex items-center gap-1.5"
                    >
                      <BreadcrumbSeparator>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60" />
                      </BreadcrumbSeparator>
                      <BreadcrumbItem>
                        {isLast ? (
                          <BreadcrumbPage className="font-bold truncate max-w-[200px]">
                            {crumb.name}
                          </BreadcrumbPage>
                        ) : (
                          <BreadcrumbLink
                            className="cursor-pointer rounded-md px-1.5 py-0.5 -mx-1.5 transition-colors hover:bg-accent/50"
                            onClick={() => setCurrentFolderId(crumb.id)}
                          >
                            <span className="truncate max-w-[150px] inline-block align-bottom">
                              {crumb.name}
                            </span>
                          </BreadcrumbLink>
                        )}
                      </BreadcrumbItem>
                    </motion.span>
                  );
                })}
              </AnimatePresence>
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        {/* Desktop Search */}
        <div className="relative hidden sm:block w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search files..."
            value={searchInputValue}
            className={cn(
              "pl-9 h-9 transition-all duration-200 focus:w-80",
              "focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/50"
            )}
            onChange={(e) => handleSearch(e.target.value)}
          />
          {searchInputValue && (
            <button
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {isSearchActive && searchResultCount > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute -bottom-5 left-0 text-[11px] text-muted-foreground"
            >
              {searchResultCount} result{searchResultCount !== 1 ? "s" : ""} found
            </motion.div>
          )}
        </div>

        {/* Mobile Search Toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="sm:hidden h-9 w-9 transition-all duration-200"
          onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
        >
          {mobileSearchOpen ? <X className="w-4 h-4" /> : <Search className="w-4 h-4" />}
        </Button>
      </div>

      {/* Mobile Search Bar (expandable) */}
      <AnimatePresence>
        {mobileSearchOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="sm:hidden overflow-hidden"
          >
            <div className="px-4 pb-2">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search files..."
                  value={searchInputValue}
                  className="pl-9 pr-9 h-9 w-full focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/50"
                  onChange={(e) => handleSearch(e.target.value)}
                  autoFocus
                />
                {searchInputValue && (
                  <button
                    onClick={handleClearSearch}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {isSearchActive && searchResultCount > 0 && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  {searchResultCount} result{searchResultCount !== 1 ? "s" : ""} found
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom row: actions + view toggle */}
      <div className={cn("flex items-center justify-between px-4 pb-3 gap-2", isSearchActive && "pt-1")}>
        <div className="flex items-center gap-2">
          {section === "files" && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleUploadClick}
                className="gap-1.5 transition-all duration-200 hover:scale-105 hover:border-emerald-500/40 hover:text-emerald-700 dark:hover:text-emerald-400"
              >
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">Upload</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCreateFolderOpen(true)}
                className="gap-1.5 transition-all duration-200 hover:scale-105 hover:border-emerald-500/40 hover:text-emerald-700 dark:hover:text-emerald-400"
              >
                <FolderPlus className="w-4 h-4" />
                <span className="hidden sm:inline">New Folder</span>
              </Button>
            </>
          )}
          {section === "trash" && (stats?.trashedCount ?? 0) > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive transition-all duration-200">
                  <Trash2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Empty Trash</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Empty Trash?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all items in the trash. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      try {
                        const res = await fetch("/api/files/trash", { method: "DELETE" });
                        if (res.ok) {
                          queryClient.invalidateQueries({ queryKey: ["files"] });
                          queryClient.invalidateQueries({ queryKey: ["storage-stats"] });
                        }
                      } catch { /* silent */ }
                    }}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete All
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        {/* Sort controls */}
        <div className="flex items-center gap-1.5">
          <Select
            value={sortBy}
            onValueChange={(val) => {
              setSortBy(val as SortField);
            }}
          >
            <SelectTrigger className="h-9 w-[140px] text-xs max-[400px]:w-9 max-[400px]:px-0 max-[400px]:justify-center transition-all duration-200 hover:bg-accent/50 hover:border-emerald-500/30">
              <ArrowUpDown className="w-4 h-4 mr-1.5 max-[400px]:mr-0" />
              <SelectValue className="max-[400px]:hidden" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="updatedAt">Modified</SelectItem>
              <SelectItem value="size">Size</SelectItem>
              <SelectItem value="type">Type</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 transition-all duration-200 hover:bg-accent/50 hover:text-emerald-700 dark:hover:text-emerald-400"
            onClick={() => setSortDirection(sortDirection === "asc" ? "desc" : "asc")}
          >
            <ArrowUpDown className={cn("w-4 h-4 transition-transform", sortDirection === "desc" && "rotate-180")} />
          </Button>
        </div>

        {/* Keyboard shortcuts button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 transition-all duration-200 hover:bg-accent/50 hover:text-emerald-700 dark:hover:text-emerald-400"
          onClick={() => setShortcutsOpen(true)}
          title="Keyboard shortcuts (?)"
        >
          <Keyboard className="w-4 h-4" />
        </Button>

        {/* Activity panel */}
        <ActivityPanel />

        {/* View toggle with emerald indicator */}
        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(val) => {
            if (val) setViewMode(val as "grid" | "list");
          }}
          className="border rounded-lg"
        >
          <ToggleGroupItem
            value="grid"
            size="sm"
            aria-label="Grid view"
            className={cn(
              "transition-all duration-200",
              viewMode === "grid" && "text-emerald-700 dark:text-emerald-400 data-[state=on]:bg-emerald-500/10"
            )}
          >
            <LayoutGrid className="w-4 h-4" />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="list"
            size="sm"
            aria-label="List view"
            className={cn(
              "transition-all duration-200",
              viewMode === "list" && "text-emerald-700 dark:text-emerald-400 data-[state=on]:bg-emerald-500/10"
            )}
          >
            <List className="w-4 h-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Type filter tabs - only in All Files section at root level without search */}
      {section === "files" && currentFolderId === "root" && !searchQuery && (
        <div className="flex items-center gap-1 px-4 pb-2 pt-1 border-t border-border/50 overflow-x-auto">
          {[
            { id: "all", label: "All", icon: null },
            { id: "images", label: "Images", icon: Image },
            { id: "videos", label: "Videos", icon: Film },
            { id: "audio", label: "Audio", icon: Music },
            { id: "documents", label: "Docs", icon: FileText },
            { id: "code", label: "Code", icon: FileCode },
            { id: "archives", label: "Archives", icon: Archive },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setTypeFilter(tab.id as FileTypeFilter)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 whitespace-nowrap",
                  typeFilter === tab.id
                    ? "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
                    : "text-muted-foreground hover:bg-accent/50"
                )}
              >
                {Icon && <Icon className="w-3.5 h-3.5" />}
                {tab.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
