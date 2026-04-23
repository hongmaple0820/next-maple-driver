"use client";

import { useRef, useCallback, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Search, LayoutGrid, List, FolderPlus, ChevronRight, ChevronLeft, Trash2, ArrowUpDown, Image, Film, Music, FileText, FileCode, Archive, Keyboard, X, Palette, CloudUpload, Home, FolderUp, HardDrive } from "lucide-react";
import { useFileStore, type SortField, type FileTypeFilter, type ColorLabelFilter } from "@/store/file-store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MobileMenuButton } from "@/components/file-sidebar";
import { uploadFilesWithProgress } from "@/lib/upload-utils";
import { COLOR_LABELS } from "@/lib/file-utils";
import type { StorageStats } from "@/lib/file-utils";
import { ActivityPanel } from "@/components/activity-panel";
import { QuickTransferPopover } from "@/components/quick-transfer-popover";
import { useI18n } from "@/lib/i18n";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
    colorLabelFilter,
    setColorLabelFilter,
    navigateBack,
    navigateForward,
    historyIndex,
    navigationHistory,
    selectedFileIds,
    setCrossDriverMoveOpen,
    setCrossDriverMoveFileIds,
    currentDriverId,
    currentDriverName,
    setCurrentDriverId,
  } = useFileStore();

  const { t } = useI18n();

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < navigationHistory.length - 1;

  const queryClient = useQueryClient();
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [searchInputValue, setSearchInputValue] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);

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

  // "/" keyboard shortcut to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target as HTMLElement)?.isContentEditable) return;
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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

  const handleFolderUploadClick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    // @ts-expect-error webkitdirectory is not in the type definitions
    input.webkitdirectory = true;
    // @ts-expect-error directory is not in the type definitions
    input.directory = true;
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;

      // Build paths mapping from webkitRelativePath
      const paths: Record<string, string> = {};
      const fileArray = Array.from(files);
      fileArray.forEach((file, idx) => {
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
        if (relativePath) {
          paths[idx] = relativePath;
        }
      });

      // Upload with paths for folder structure preservation
      const formData = new FormData();
      fileArray.forEach((file) => {
        formData.append("files", file);
      });
      formData.append("parentId", currentFolderId);
      if (Object.keys(paths).length > 0) {
        formData.append("paths", JSON.stringify(paths));
      }

      try {
        const xhr = new XMLHttpRequest();
        const uploadId = crypto.randomUUID();
        const { addUploadProgress, updateUploadProgress, removeUploadProgress } = useFileStore.getState();

        addUploadProgress({
          id: uploadId,
          fileName: fileArray.length === 1 ? fileArray[0].name : `${fileArray.length} files`,
          progress: 0,
          status: "uploading",
        });

        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            const percent = Math.round((ev.loaded / ev.total) * 100);
            updateUploadProgress(uploadId, percent);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            updateUploadProgress(uploadId, 100, "done");
            setTimeout(() => removeUploadProgress(uploadId), 2000);
            queryClient.invalidateQueries({ queryKey: ["files"] });
            queryClient.invalidateQueries({ queryKey: ["storage-stats"] });
            toast.success(`${fileArray.length} ${t.app.files} ${t.app.uploaded}`);
          } else {
            updateUploadProgress(uploadId, 0, "error");
            setTimeout(() => removeUploadProgress(uploadId), 3000);
            toast.error(t.app.upload + " failed");
          }
        };

        xhr.onerror = () => {
          updateUploadProgress(uploadId, 0, "error");
          setTimeout(() => removeUploadProgress(uploadId), 3000);
          toast.error(t.app.upload + " failed");
        };

        xhr.open("POST", "/api/files/upload");
        xhr.send(formData);
      } catch {
        toast.error(t.app.upload + " failed");
      }
    };
    input.click();
  };

  const sectionLabels: Record<string, string> = {
    files: t.app.allFiles,
    recent: t.app.recent,
    starred: t.app.starred,
    trash: t.app.trash,
  };

  const isSearchActive = searchQuery.trim().length > 0;

  return (
    <div className="border-b border-border/60 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/50 sticky top-0 z-30">
      {/* Top row: hamburger + breadcrumb + search */}
      <div className="flex items-center gap-2 px-4 py-2.5">
        <MobileMenuButton />

        {/* Back / Forward / Home navigation buttons */}
        <div className="flex items-center gap-0.5 mr-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 transition-all duration-150 active:scale-95"
                disabled={!canGoBack}
                onClick={() => navigateBack()}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {t.app.back} <span className="text-muted-foreground ml-1">Alt+←</span>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 transition-all duration-150 active:scale-95"
                disabled={!canGoForward}
                onClick={() => navigateForward()}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {t.app.forward} <span className="text-muted-foreground ml-1">Alt+→</span>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 transition-all duration-150 active:scale-95"
                disabled={currentFolderId === "root"}
                onClick={() => setCurrentFolderId("root")}
              >
                <Home className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {t.app.allFilesNav} <span className="text-muted-foreground ml-1">Alt+Home</span>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Breadcrumb with animations */}
        <div className="flex-1 min-w-0">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                {currentFolderId === "root" ? (
                  <BreadcrumbPage className="font-bold text-foreground flex items-center gap-2">
                    {sectionLabels[section]}
                    {currentDriverId && section === "files" && (
                      <button
                        onClick={() => setCurrentDriverId(null)}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/20 hover:bg-emerald-500/20 transition-colors cursor-pointer"
                      >
                        <HardDrive className="w-3 h-3" />
                        {currentDriverName}
                        <X className="w-2.5 h-2.5 ml-0.5 opacity-60" />
                      </button>
                    )}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    className="cursor-pointer font-medium rounded-md px-1.5 py-0.5 -mx-1.5 transition-colors hover:bg-accent/50"
                    onClick={() => setCurrentFolderId("root")}
                  >
                    {sectionLabels[section]}
                    {currentDriverId && section === "files" && (
                      <span className="inline-flex items-center gap-1 ml-1.5 px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/20">
                        <HardDrive className="w-3 h-3" />
                        {currentDriverName}
                      </span>
                    )}
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
          <Search className={cn(
            "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none transition-transform duration-200",
            searchFocused && "rotate-12"
          )} />
          <Input
            ref={searchInputRef}
            placeholder={t.app.search}
            value={searchInputValue}
            className={cn(
              "pl-9 h-9 transition-all duration-200 focus:w-80",
              "focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/50",
              "focus-visible:shadow-[0_0_0_3px_rgba(16,185,129,0.1)]",
              !searchInputValue && !searchFocused && "pr-9"
            )}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
          {!searchInputValue && !searchFocused && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
              <kbd className="text-[10px] bg-muted border rounded px-1.5 py-0.5 font-mono text-muted-foreground">⌘K</kbd>
              <span className="text-[10px] text-muted-foreground/50">or</span>
              <kbd className="text-[10px] bg-muted border rounded px-1 py-0.5 font-mono text-muted-foreground">/</kbd>
            </div>
          )}
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
              {searchResultCount} {t.app.resultsFound}
            </motion.div>
          )}
        </div>

        {/* Mobile Search Toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="sm:hidden h-9 w-9 transition-all duration-150 active:scale-95"
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
                  placeholder={t.app.search}
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
                  {searchResultCount} {t.app.resultsFound}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom row: actions + view toggle */}
      <div className={cn("flex items-center justify-between px-4 pb-2.5 gap-2", isSearchActive && "pt-1")}>
        <div className="flex items-center gap-1.5">
          {section === "files" && (
            <>
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    onClick={handleUploadClick}
                    className="gap-1.5 h-8 text-xs transition-all duration-150 active:scale-95 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-500/20"
                  >
                    <CloudUpload className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{t.app.upload}</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleFolderUploadClick}
                    className="gap-1.5 h-8 text-xs transition-all duration-150 active:scale-95 hover:border-emerald-500/40 hover:text-emerald-700 dark:hover:text-emerald-400 hover:bg-emerald-500/5"
                  >
                    <FolderUp className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{t.app.uploadFolder}</span>
                  </Button>
                </div>
                <span className="text-[10px] text-muted-foreground/70 pl-1 hidden sm:block">Up to 500 MB per file</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCreateFolderOpen(true)}
                className="gap-1.5 h-8 text-xs transition-all duration-150 active:scale-95 hover:border-emerald-500/40 hover:text-emerald-700 dark:hover:text-emerald-400 hover:bg-emerald-500/5"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t.app.newFolder}</span>
              </Button>
              <QuickTransferPopover />
            </>
          )}
          {selectedFileIds.size > 0 && section === "files" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-8 text-xs transition-all duration-150 active:scale-95 hover:border-emerald-500/40 hover:text-emerald-700 dark:hover:text-emerald-400 hover:bg-emerald-500/5"
                  onClick={() => {
                    setCrossDriverMoveFileIds(Array.from(selectedFileIds));
                    setCrossDriverMoveOpen(true);
                  }}
                >
                  <HardDrive className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t.app.transferToDriver}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {t.app.transferToDriver}
              </TooltipContent>
            </Tooltip>
          )}
          {section === "trash" && (stats?.trashedCount ?? 0) > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive transition-all duration-150 active:scale-95">
                  <Trash2 className="w-4 h-4" />
                  <span className="hidden sm:inline">{t.app.emptyTrash}</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t.app.emptyTrash}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t.app.emptyTrashConfirm}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t.app.cancel}</AlertDialogCancel>
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
                    {t.app.delete} {t.app.selectAll.split(" ")[0]}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        {/* Sort controls */}
        <div className="flex items-center gap-1.5">
          {/* Color label filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-8 gap-1.5 text-xs transition-all duration-150 active:scale-95",
                  colorLabelFilter
                    ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400 bg-emerald-500/5"
                    : "hover:border-emerald-500/30 hover:bg-accent/50"
                )}
              >
                <Palette className="w-3.5 h-3.5" />
                {colorLabelFilter ? (
                  <span className={cn("w-2.5 h-2.5 rounded-full", COLOR_LABELS[colorLabelFilter]?.dot)} />
                ) : (
                  <span className="hidden sm:inline">{t.app.colorLabelFilter}</span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[160px]">
              <DropdownMenuItem
                onClick={() => setColorLabelFilter("" as ColorLabelFilter)}
                className={cn(!colorLabelFilter && "font-semibold")}
              >
                {t.app.allColors}
              </DropdownMenuItem>
              {Object.entries(COLOR_LABELS).map(([key, style]) => (
                <DropdownMenuItem
                  key={key}
                  onClick={() => setColorLabelFilter(key as ColorLabelFilter)}
                  className={cn("flex items-center gap-2", colorLabelFilter === key && "font-semibold")}
                >
                  <span className={cn("w-3 h-3 rounded-full", style.dot)} />
                  {style.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Select
            value={sortBy}
            onValueChange={(val) => {
              setSortBy(val as SortField);
            }}
          >
            <SelectTrigger className="h-9 w-[140px] text-xs max-[400px]:w-9 max-[400px]:px-0 max-[400px]:justify-center transition-all duration-150 active:scale-95 hover:bg-accent/50 hover:border-emerald-500/30">
              <ArrowUpDown className="w-4 h-4 mr-1.5 max-[400px]:mr-0" />
              <SelectValue className="max-[400px]:hidden" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">{t.app.name}</SelectItem>
              <SelectItem value="updatedAt">{t.app.modified}</SelectItem>
              <SelectItem value="size">{t.app.size}</SelectItem>
              <SelectItem value="type">{t.app.type}</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 transition-all duration-150 active:scale-95 hover:bg-accent/50 hover:text-emerald-700 dark:hover:text-emerald-400"
            onClick={() => setSortDirection(sortDirection === "asc" ? "desc" : "asc")}
          >
            <ArrowUpDown className={cn("w-4 h-4 transition-transform", sortDirection === "desc" && "rotate-180")} />
          </Button>
        </div>

        {/* Keyboard shortcuts button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 transition-all duration-150 active:scale-95 hover:bg-accent/50 hover:text-emerald-700 dark:hover:text-emerald-400"
          onClick={() => setShortcutsOpen(true)}
          title={`${t.app.shortcuts} (?)`}
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
            aria-label={t.app.gridView}
            className={cn(
              "transition-all duration-200 data-[state=on]:shadow-sm data-[state=on]:shadow-emerald-500/10",
              viewMode === "grid" && "text-emerald-700 dark:text-emerald-400 data-[state=on]:bg-emerald-500/10"
            )}
          >
            <LayoutGrid className="w-4 h-4" />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="list"
            size="sm"
            aria-label={t.app.listView}
            className={cn(
              "transition-all duration-200 data-[state=on]:shadow-sm data-[state=on]:shadow-emerald-500/10",
              viewMode === "list" && "text-emerald-700 dark:text-emerald-400 data-[state=on]:bg-emerald-500/10"
            )}
          >
            <List className="w-4 h-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Type filter tabs - only in All Files section at root level without search */}
      {section === "files" && currentFolderId === "root" && !searchQuery && (
        <div className="flex items-center gap-1 px-4 pb-2 pt-1 border-t border-border/50 overflow-x-auto bg-muted/20">
          {[
            { id: "all", label: t.app.filterAll, icon: null },
            { id: "images", label: t.app.filterImages, icon: Image },
            { id: "videos", label: t.app.filterVideos, icon: Film },
            { id: "audio", label: t.app.filterAudio, icon: Music },
            { id: "documents", label: t.app.filterDocs, icon: FileText },
            { id: "code", label: t.app.filterCode, icon: FileCode },
            { id: "archives", label: t.app.filterArchives, icon: Archive },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setTypeFilter(tab.id as FileTypeFilter)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 whitespace-nowrap",
                  typeFilter === tab.id
                    ? "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 shadow-sm shadow-emerald-500/10 ring-1 ring-emerald-500/20"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
              >
                {Icon && <Icon className="w-3.5 h-3.5" />}
                {tab.label}
              </button>
            );
          })}

          {/* Active color label filter indicator in tab bar */}
          {colorLabelFilter && (
            <>
              <div className="w-px h-4 bg-border/50 mx-1" />
              <button
                onClick={() => setColorLabelFilter("" as ColorLabelFilter)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 whitespace-nowrap",
                  "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
                )}
              >
                <span className={cn("w-2.5 h-2.5 rounded-full", COLOR_LABELS[colorLabelFilter]?.dot)} />
                {COLOR_LABELS[colorLabelFilter]?.label}
                <X className="w-3 h-3 ml-0.5" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
