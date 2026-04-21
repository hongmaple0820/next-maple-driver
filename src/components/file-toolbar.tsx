"use client";

import { useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, LayoutGrid, List, Upload, FolderPlus, ChevronRight, Trash2 } from "lucide-react";
import { useFileStore } from "@/store/file-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MobileMenuButton } from "@/components/file-sidebar";
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
    setCreateFolderOpen,
  } = useFileStore();

  const queryClient = useQueryClient();
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = setTimeout(() => {
        setSearchQuery(value);
      }, 300);
    },
    [setSearchQuery]
  );

  const handleUploadClick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;

      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append("files", files[i]);
      }
      formData.append("parentId", currentFolderId);

      try {
        const res = await fetch("/api/files/upload", {
          method: "POST",
          body: formData,
        });
        if (res.ok) {
          queryClient.invalidateQueries({ queryKey: ["files"] });
          queryClient.invalidateQueries({ queryKey: ["storage-stats"] });
        }
      } catch {
        // Error handled silently
      }
    };
    input.click();
  };

  const sectionLabels: Record<string, string> = {
    files: "All Files",
    recent: "Recent",
    starred: "Starred",
    trash: "Trash",
  };

  return (
    <div className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/* Top row: hamburger + breadcrumb + search */}
      <div className="flex items-center gap-2 px-4 py-3">
        <MobileMenuButton />

        {/* Breadcrumb */}
        <div className="flex-1 min-w-0">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                {currentFolderId === "root" ? (
                  <BreadcrumbPage className="font-semibold text-foreground">
                    {sectionLabels[section]}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    className="cursor-pointer font-medium"
                    onClick={() => setCurrentFolderId("root")}
                  >
                    {sectionLabels[section]}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {breadcrumbs.map((crumb, idx) => {
                const isLast = idx === breadcrumbs.length - 1;
                return (
                  <span key={crumb.id} className="flex items-center gap-1.5">
                    <BreadcrumbSeparator>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </BreadcrumbSeparator>
                    <BreadcrumbItem>
                      {isLast ? (
                        <BreadcrumbPage className="font-medium truncate max-w-[200px]">
                          {crumb.name}
                        </BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink
                          className="cursor-pointer"
                          onClick={() => setCurrentFolderId(crumb.id)}
                        >
                          <span className="truncate max-w-[150px] inline-block align-bottom">
                            {crumb.name}
                          </span>
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                  </span>
                );
              })}
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        {/* Search */}
        <div className="relative hidden sm:block w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search files..."
            className="pl-9 h-9"
            defaultValue={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Bottom row: actions + view toggle */}
      <div className="flex items-center justify-between px-4 pb-3 gap-2">
        <div className="flex items-center gap-2">
          {/* Mobile search */}
          <div className="relative sm:hidden flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              className="pl-9 h-9"
              defaultValue={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>

          {section === "files" && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleUploadClick}
                className="gap-1.5"
              >
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">Upload</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCreateFolderOpen(true)}
                className="gap-1.5"
              >
                <FolderPlus className="w-4 h-4" />
                <span className="hidden sm:inline">New Folder</span>
              </Button>
            </>
          )}
          {section === "trash" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive">
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

        {/* View toggle */}
        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(val) => {
            if (val) setViewMode(val as "grid" | "list");
          }}
          className="border rounded-lg"
        >
          <ToggleGroupItem value="grid" size="sm" aria-label="Grid view">
            <LayoutGrid className="w-4 h-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="list" size="sm" aria-label="List view">
            <List className="w-4 h-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  );
}
