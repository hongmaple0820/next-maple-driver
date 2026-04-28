"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight, ChevronLeft, Home, LayoutGrid, List, RefreshCw,
  Folder, File, Server, Cloud, Globe, Network, HardDrive,
  FolderOpen, ArrowUpDown, Clock, Download, Trash2, FolderPlus,
  Image as ImageIcon, Film, Music, FileText, FileCode, Archive, Table2,
  type LucideIcon,
} from "lucide-react";
import { useFileStore, type ViewMode, type VfsBreadcrumbItem } from "@/store/file-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatFileSize, formatRelativeTime } from "@/lib/file-utils";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
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
import type { FileInfo } from "@/lib/storage-drivers/types";

// Static icon map to avoid creating components during render (lint rule)
const driverIconMap: Record<string, LucideIcon> = {
  local: Server,
  webdav: Globe,
  s3: Cloud,
  mount: Network,
  ftp: Globe,
  baidu: Cloud,
  aliyun: Cloud,
  onedrive: Cloud,
  google: Cloud,
  "115": HardDrive,
  quark: HardDrive,
};

const driverIconColorMap: Record<string, string> = {
  local: "text-emerald-500",
  webdav: "text-teal-500",
  s3: "text-amber-500",
  baidu: "text-blue-500",
  aliyun: "text-orange-500",
  onedrive: "text-blue-600",
  google: "text-red-500",
  "115": "text-amber-600",
  quark: "text-purple-500",
  ftp: "text-sky-500",
};

const driverBgColorMap: Record<string, string> = {
  local: "bg-emerald-500/10",
  webdav: "bg-teal-500/10",
  s3: "bg-amber-500/10",
  baidu: "bg-blue-500/10",
  aliyun: "bg-orange-500/10",
  onedrive: "bg-blue-600/10",
  google: "bg-red-500/10",
  "115": "bg-amber-600/10",
  quark: "bg-purple-500/10",
  ftp: "bg-sky-500/10",
};

// Static icon map for file type icons
const fileIconMap: Record<string, LucideIcon> = {
  Folder,
  ImageIcon,
  Film,
  Music,
  FileText,
  FileCode,
  Archive,
  Table2,
  File,
};

function getVfsFileIconName(item: FileInfo): string {
  if (item.isDir) return "Folder";
  const ext = item.name.split(".").pop()?.toLowerCase() || "";
  const mime = item.mimeType?.toLowerCase() || "";
  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"].includes(ext)) return "ImageIcon";
  if (mime.startsWith("video/") || ["mp4", "webm", "avi", "mov", "mkv", "flv"].includes(ext)) return "Film";
  if (mime.startsWith("audio/") || ["mp3", "wav", "ogg", "flac", "aac", "m4a"].includes(ext)) return "Music";
  if (mime === "application/pdf" || ext === "pdf") return "FileText";
  if (mime.includes("spreadsheet") || ["xls", "xlsx", "csv", "ods"].includes(ext)) return "Table2";
  if (mime.includes("json") || mime.includes("javascript") || mime.includes("typescript") ||
    ["js", "ts", "tsx", "jsx", "py", "rb", "go", "rs", "java", "c", "cpp", "html", "css", "md"].includes(ext)) return "FileCode";
  if (mime.includes("zip") || mime.includes("rar") || mime.includes("tar") || ["zip", "rar", "tar", "gz", "7z"].includes(ext)) return "Archive";
  if (mime.includes("document") || mime.includes("word") || mime.includes("text/plain") || ["doc", "docx", "txt", "rtf"].includes(ext)) return "FileText";
  return "File";
}

function getVfsFileIconColor(item: FileInfo): string {
  if (item.isDir) return "text-amber-500";
  const ext = item.name.split(".").pop()?.toLowerCase() || "";
  const mime = item.mimeType?.toLowerCase() || "";
  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) return "text-emerald-500";
  if (mime.startsWith("video/") || ["mp4", "webm", "avi", "mov"].includes(ext)) return "text-rose-500";
  if (mime.startsWith("audio/") || ["mp3", "wav", "ogg", "flac"].includes(ext)) return "text-purple-500";
  if (mime === "application/pdf" || ext === "pdf") return "text-red-500";
  if (mime.includes("spreadsheet") || ["xls", "xlsx", "csv"].includes(ext)) return "text-emerald-600";
  if (["js", "ts", "tsx", "jsx", "py", "rb", "go", "rs", "java", "html", "css", "md"].includes(ext)) return "text-sky-500";
  if (["zip", "rar", "tar", "gz", "7z"].includes(ext)) return "text-orange-500";
  if (mime.includes("document") || ["doc", "docx", "txt", "rtf"].includes(ext)) return "text-blue-500";
  return "text-muted-foreground";
}

// Renders the correct driver icon using a static map lookup
function DriverIcon({ type, className }: { type: string; className?: string }) {
  const Comp = driverIconMap[type] || Cloud;
  return <Comp className={className} />;
}

// Renders the correct file icon using a static map lookup
function VfsFileIcon({ item, className }: { item: FileInfo; className?: string }) {
  const iconName = getVfsFileIconName(item);
  const Comp = fileIconMap[iconName] || File;
  return <Comp className={className} />;
}

// Mount point card component
function MountPointCard({
  mount,
  onClick,
  t,
}: {
  mount: {
    id: string;
    driverId: string;
    mountPath: string;
    driverType: string;
    isReadOnly: boolean;
    driverName?: string;
  };
  onClick: () => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const iconColor = driverIconColorMap[mount.driverType] || "text-muted-foreground";
  const bgColor = driverBgColorMap[mount.driverType] || "bg-muted/50";
  const displayName = mount.mountPath.replace(/^\/+/, "").split("/")[0] || mount.mountPath;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <Card
        className="cursor-pointer transition-all duration-200 hover:shadow-lg hover:shadow-emerald-500/5 hover:border-emerald-500/30 group overflow-hidden"
        onClick={onClick}
      >
        <div className="p-5 flex flex-col items-center gap-3">
          <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center transition-transform duration-200 group-hover:scale-110", bgColor)}>
            <DriverIcon type={mount.driverType} className={cn("w-7 h-7", iconColor)} />
          </div>
          <div className="text-center">
            <p className="font-semibold text-sm truncate max-w-[120px]">{displayName}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 capitalize">{mount.driverType} {t.app.storage}</p>
          </div>
          <div className="flex items-center gap-1.5">
            {mount.isReadOnly ? (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
                {t.app.readOnly}
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                {t.app.readWrite}
              </Badge>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

// VFS file item in grid view
function VfsFileCard({
  item,
  onNavigate,
  onFileClick,
  onDownload,
  onDelete,
  isReadOnly,
  t,
}: {
  item: FileInfo;
  onNavigate: (name: string) => void;
  onFileClick?: (item: FileInfo) => void;
  onDownload?: (item: FileInfo) => void;
  onDelete?: (item: FileInfo) => void;
  isReadOnly: boolean;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const iconColor = getVfsFileIconColor(item);
  const isDir = item.isDir;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      whileHover={{ scale: 1.02 }}
    >
      <Card
        className={cn(
          "cursor-pointer transition-all duration-200 overflow-hidden group",
          isDir
            ? "hover:shadow-md hover:shadow-amber-500/5 hover:border-amber-500/30"
            : "hover:shadow-md hover:shadow-emerald-500/5 hover:border-emerald-500/30"
        )}
        onClick={() => isDir ? onNavigate(item.name) : onFileClick?.(item)}
      >
        <div className="p-4 flex flex-col items-center gap-2">
          <div className={cn(
            "w-12 h-12 rounded-xl flex items-center justify-center transition-transform duration-200 group-hover:scale-105",
            isDir ? "bg-amber-500/10" : "bg-muted/50"
          )}>
            <VfsFileIcon item={item} className={cn("w-6 h-6", iconColor)} />
          </div>
          <p className="text-sm font-medium truncate max-w-full text-center">{item.name}</p>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            {isDir ? (
              <span>{t.app.folder}</span>
            ) : (
              <>
                {item.size > 0 && <span>{formatFileSize(item.size)}</span>}
                {item.lastModified && (
                  <>
                    <span>·</span>
                    <span>{formatRelativeTime(item.lastModified)}</span>
                  </>
                )}
              </>
            )}
          </div>
          {/* Quick actions for files */}
          {!isDir && !isReadOnly && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {onDownload && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => { e.stopPropagation(); onDownload(item); }}
                    >
                      <Download className="w-3.5 h-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t.app.download}</TooltipContent>
                </Tooltip>
              )}
              {onDelete && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); onDelete(item); }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t.app.delete}</TooltipContent>
                </Tooltip>
              )}
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

// VFS file item in list view
function VfsFileRow({
  item,
  onNavigate,
  onFileClick,
  onDownload,
  onDelete,
  isReadOnly,
  t,
}: {
  item: FileInfo;
  onNavigate: (name: string) => void;
  onFileClick?: (item: FileInfo) => void;
  onDownload?: (item: FileInfo) => void;
  onDelete?: (item: FileInfo) => void;
  isReadOnly: boolean;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const iconColor = getVfsFileIconColor(item);
  const isDir = item.isDir;

  return (
    <motion.tr
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className={cn(
        "group cursor-pointer transition-colors hover:bg-muted/50",
        isDir ? "hover:bg-amber-500/5" : "hover:bg-emerald-500/5"
      )}
      onClick={() => isDir ? onNavigate(item.name) : onFileClick?.(item)}
    >
      <td className="py-2.5 px-4">
        <div className="flex items-center gap-3">
          <VfsFileIcon item={item} className={cn("w-5 h-5 shrink-0", iconColor)} />
          <span className={cn("text-sm truncate max-w-[300px]", isDir && "font-medium")}>{item.name}</span>
        </div>
      </td>
      <td className="py-2.5 px-4 text-sm text-muted-foreground hidden md:table-cell">
        {isDir ? "—" : formatFileSize(item.size)}
      </td>
      <td className="py-2.5 px-4 text-sm text-muted-foreground hidden sm:table-cell">
        {item.mimeType || (isDir ? t.app.folder : "File")}
      </td>
      <td className="py-2.5 px-4 text-sm text-muted-foreground hidden lg:table-cell">
        {item.lastModified ? formatRelativeTime(item.lastModified) : "—"}
      </td>
      <td className="py-2.5 px-4">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {!isDir && onDownload && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => { e.stopPropagation(); onDownload(item); }}
            >
              <Download className="w-3.5 h-3.5" />
            </Button>
          )}
          {!isReadOnly && onDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); onDelete(item); }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </td>
    </motion.tr>
  );
}

export function VfsBrowser() {
  const {
    vfsPath, vfsBreadcrumb, navigateToVfsPath, navigateToVfsRoot, navigateToVfsParent,
    setSection, currentDriverId, setCurrentDriverId, setCurrentFolderId,
    setVfsMode, setVfsPath,
  } = useFileStore();
  const { t } = useI18n();

  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sortBy, setSortBy] = useState<"name" | "size" | "modified">("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);

  const isRoot = vfsPath === "/" || vfsPath === "";

  // Fetch VFS mount points
  const { data: mountsData, isLoading: mountsLoading, refetch: refetchMounts } = useQuery({
    queryKey: ["vfs-mounts-browser"],
    queryFn: async () => {
      const res = await fetch("/api/vfs?action=mounts");
      if (!res.ok) throw new Error("Failed to fetch VFS mounts");
      return res.json();
    },
  });

  // Fetch directory listing
  const { data: dirData, isLoading: dirLoading, refetch: refetchDir } = useQuery({
    queryKey: ["vfs-dir", vfsPath],
    queryFn: async () => {
      if (isRoot) return { items: [], path: "/" };
      const pathSegments = vfsPath.replace(/^\/+/, "");
      const res = await fetch(`/api/vfs/${pathSegments}`);
      if (!res.ok) throw new Error("Failed to list VFS directory");
      return res.json();
    },
    enabled: !isRoot,
  });

  const mounts = mountsData?.mounts || [];
  const items: FileInfo[] = dirData?.items || [];

  // Sort items
  const sortedItems = [...items].sort((a, b) => {
    // Folders first
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;

    let cmp = 0;
    switch (sortBy) {
      case "name":
        cmp = a.name.localeCompare(b.name);
        break;
      case "size":
        cmp = a.size - b.size;
        break;
      case "modified": {
        const aTime = a.lastModified ? new Date(a.lastModified).getTime() : 0;
        const bTime = b.lastModified ? new Date(b.lastModified).getTime() : 0;
        cmp = aTime - bTime;
        break;
      }
    }
    return sortDirection === "asc" ? cmp : -cmp;
  });

  // Find current mount info for read-only check
  const currentMount = mounts.find((m: { mountPath: string; driverId: string }) => {
    const normalizedMountPath = "/" + m.mountPath.replace(/^\/+/, "").replace(/\/+$/, "");
    const normalizedVfsPath = "/" + vfsPath.replace(/^\/+/, "").replace(/\/+$/, "");
    return normalizedVfsPath === normalizedMountPath || normalizedVfsPath.startsWith(normalizedMountPath + "/");
  });
  const isReadOnly = currentMount?.isReadOnly ?? false;

  // Handle mount point click
  const handleMountClick = useCallback((mount: { mountPath: string; driverId: string; driverType: string }) => {
    navigateToVfsPath(mount.mountPath, mount.driverId, mount.driverType);
  }, [navigateToVfsPath]);

  // Handle folder navigation
  const handleFolderNavigate = useCallback((name: string) => {
    const newPath = vfsPath === "/" ? `/${name}` : `${vfsPath}/${name}`;
    navigateToVfsPath(newPath);
  }, [vfsPath, navigateToVfsPath]);

  // Handle file click - show toast with file info
  const handleFileClick = useCallback((item: FileInfo) => {
    const sizeStr = item.size > 0 ? formatFileSize(item.size) : "";
    const modStr = item.lastModified ? formatRelativeTime(item.lastModified) : "";
    const parts = [item.name];
    if (sizeStr) parts.push(sizeStr);
    if (modStr) parts.push(modStr);
    if (item.mimeType) parts.push(item.mimeType);
    toast.info(parts.join(" · "), {
      description: t.app.fileInfo,
    });
  }, [t]);

  // Handle download
  const handleDownload = useCallback(async (item: FileInfo) => {
    const filePath = vfsPath === "/" ? `/${item.name}` : `${vfsPath}/${item.name}`;
    const pathSegments = filePath.replace(/^\/+/, "");
    try {
      const res = await fetch(`/api/vfs/${pathSegments}?action=download`);
      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          window.open(data.url, "_blank");
        }
      }
    } catch {
      // Silent - could add toast
    }
  }, [vfsPath]);

  // Handle delete
  const handleDelete = useCallback(async (item: FileInfo) => {
    const filePath = vfsPath === "/" ? `/${item.name}` : `${vfsPath}/${item.name}`;
    const pathSegments = filePath.replace(/^\/+/, "");
    try {
      const res = await fetch(`/api/vfs/${pathSegments}`, { method: "DELETE" });
      if (res.ok) {
        refetchDir();
      }
    } catch {
      // Silent - could add toast
    }
  }, [vfsPath, refetchDir]);

  // Handle breadcrumb click
  const handleBreadcrumbClick = useCallback((crumb: VfsBreadcrumbItem) => {
    if (crumb.path === "/") {
      navigateToVfsRoot();
    } else {
      navigateToVfsPath(crumb.path, crumb.driverId, crumb.driverType);
    }
  }, [navigateToVfsPath, navigateToVfsRoot]);

  // Handle sort toggle
  const toggleSort = useCallback((field: "name" | "size" | "modified") => {
    if (sortBy === field) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortDirection("asc");
    }
  }, [sortBy]);

  // Handle create new folder
  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) return;
    setCreatingFolder(true);
    try {
      const folderPath = vfsPath === "/" ? `/${newFolderName.trim()}` : `${vfsPath}/${newFolderName.trim()}`;
      const pathSegments = folderPath.replace(/^\/+/, "");
      const res = await fetch(`/api/vfs/${pathSegments}?action=mkdir`, { method: "POST" });
      if (res.ok) {
        toast.success(t.app.folderCreated);
        setNewFolderOpen(false);
        setNewFolderName("");
        refetchDir();
      } else {
        const data = await res.json().catch(() => ({ error: "Unknown error" }));
        toast.error(data.error || t.app.folderCreateFailed);
      }
    } catch {
      toast.error(t.app.folderCreateFailed);
    } finally {
      setCreatingFolder(false);
    }
  }, [newFolderName, vfsPath, refetchDir, t]);

  return (
    <div className="flex flex-col h-full">
      {/* VFS Toolbar */}
      <div className="border-b border-border/60 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/50">
        {/* Top row: nav + breadcrumb */}
        <div className="flex items-center gap-2 px-4 py-2.5">
          {/* Navigation buttons */}
          <div className="flex items-center gap-0.5 mr-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={navigateToVfsParent}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">{t.app.goBack}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={navigateToVfsRoot}
                >
                  <Home className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">{t.app.drivesRoot}</TooltipContent>
            </Tooltip>
          </div>

          {/* VFS Breadcrumb */}
          <div className="flex-1 min-w-0">
            <Breadcrumb>
              <BreadcrumbList>
                {vfsBreadcrumb.map((crumb, idx) => {
                  const isLast = idx === vfsBreadcrumb.length - 1;
                  return (
                    <span key={crumb.path} className="flex items-center gap-1.5">
                      {idx > 0 && (
                        <BreadcrumbSeparator>
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60" />
                        </BreadcrumbSeparator>
                      )}
                      <BreadcrumbItem>
                        {isLast ? (
                          <BreadcrumbPage className="font-bold truncate max-w-[200px] flex items-center gap-1.5">
                            {idx === 0 && <HardDrive className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />}
                            {crumb.name}
                          </BreadcrumbPage>
                        ) : (
                          <BreadcrumbLink
                            className="cursor-pointer rounded-md px-1.5 py-0.5 -mx-1.5 transition-colors hover:bg-accent/50 flex items-center gap-1.5"
                            onClick={() => handleBreadcrumbClick(crumb)}
                          >
                            {idx === 0 && <HardDrive className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />}
                            <span className="truncate max-w-[150px] inline-block align-bottom">{crumb.name}</span>
                          </BreadcrumbLink>
                        )}
                      </BreadcrumbItem>
                    </span>
                  );
                })}
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-1.5">
            {/* New Folder button - only when not at root and mount is writable */}
            {!isRoot && !isReadOnly && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                    onClick={() => setNewFolderOpen(true)}
                  >
                    <FolderPlus className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">{t.app.newFolder}</TooltipContent>
              </Tooltip>
            )}

            {/* Refresh */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => { if (isRoot) { refetchMounts(); } else { refetchDir(); } }}
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">{t.app.admin?.refresh || "Refresh"}</TooltipContent>
            </Tooltip>

            {/* View toggle */}
            <ToggleGroup
              type="single"
              value={viewMode}
              onValueChange={(val) => {
                if (val) setViewMode(val as ViewMode);
              }}
              className="border rounded-lg"
            >
              <ToggleGroupItem
                value="grid"
                size="sm"
                aria-label="Grid view"
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
                aria-label="List view"
                className={cn(
                  "transition-all duration-200 data-[state=on]:shadow-sm data-[state=on]:shadow-emerald-500/10",
                  viewMode === "list" && "text-emerald-700 dark:text-emerald-400 data-[state=on]:bg-emerald-500/10"
                )}
              >
                <List className="w-4 h-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        {/* Sort bar - only when not at root */}
        {!isRoot && items.length > 0 && (
          <div className="flex items-center gap-2 px-4 pb-2">
            <span className="text-[11px] text-muted-foreground">{t.app.sortBy}:</span>
            {[
              { field: "name" as const, label: t.app.sortByName },
              { field: "size" as const, label: t.app.sortBySize },
              { field: "modified" as const, label: t.app.sortByModified },
            ].map((tab) => (
              <button
                key={tab.field}
                onClick={() => toggleSort(tab.field)}
                className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-all",
                  sortBy === tab.field
                    ? "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/20"
                    : "text-muted-foreground hover:bg-accent/50"
                )}
              >
                {tab.field === "modified" && <Clock className="w-3 h-3" />}
                {tab.label}
                {sortBy === tab.field && (
                  <ArrowUpDown className={cn("w-2.5 h-2.5 transition-transform", sortDirection === "desc" && "rotate-180")} />
                )}
              </button>
            ))}
            <div className="ml-auto">
              <Badge variant="secondary" className="text-[10px]">
                {items.length} {t.app.items}
              </Badge>
            </div>
          </div>
        )}
      </div>

      {/* Content area */}
      <ScrollArea className="flex-1">
        <AnimatePresence mode="wait">
          {isRoot ? (
            /* Root: Show mount points */
            <motion.div
              key="mounts"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="p-6"
            >
              <div className="mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <HardDrive className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  {t.app.virtualFileSystem}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {t.app.vfsBrowseAllDrives}
                </p>
              </div>

              {mountsLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="rounded-xl border bg-card p-5 flex flex-col items-center gap-3">
                      <Skeleton className="w-14 h-14 rounded-2xl" />
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-3 w-14" />
                    </div>
                  ))}
                </div>
              ) : mounts.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center justify-center py-24 text-muted-foreground"
                >
                  <motion.div
                    animate={{ y: [0, -8, 0] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                    className="w-24 h-24 rounded-3xl flex items-center justify-center mb-6 bg-muted/50"
                  >
                    <FolderOpen className="w-12 h-12 opacity-40" />
                  </motion.div>
                  <p className="text-lg font-semibold mb-1">{t.app.noDrivesMounted}</p>
                  <p className="text-sm max-w-xs text-center text-muted-foreground/70">
                    {t.app.noDrivesMountedDesc}
                  </p>
                </motion.div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {mounts.map((mount: {
                    id: string;
                    driverId: string;
                    mountPath: string;
                    driverType: string;
                    isReadOnly: boolean;
                    driverName?: string;
                  }) => (
                    <MountPointCard
                      key={mount.id}
                      mount={mount}
                      onClick={() => handleMountClick(mount)}
                      t={t}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          ) : dirLoading ? (
            /* Loading directory */
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-4"
            >
              {viewMode === "grid" ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="rounded-xl border bg-card p-4 flex flex-col items-center gap-2">
                      <Skeleton className="w-12 h-12 rounded-xl" />
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 py-2.5 px-4">
                      <Skeleton className="w-5 h-5 rounded" />
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-4 w-16 ml-auto" />
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          ) : sortedItems.length === 0 ? (
            /* Empty directory */
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-24 text-muted-foreground min-h-[300px]"
            >
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="w-24 h-24 rounded-3xl flex items-center justify-center mb-6 bg-muted/50"
              >
                <FolderOpen className="w-12 h-12 opacity-40" />
              </motion.div>
              <p className="text-lg font-semibold mb-1">{t.app.emptyDirectory}</p>
              <p className="text-sm max-w-xs text-center text-muted-foreground/70">
                {t.app.emptyDirectoryDesc}
              </p>
            </motion.div>
          ) : viewMode === "grid" ? (
            /* Grid view */
            <motion.div
              key={`grid-${vfsPath}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 p-4"
            >
              {sortedItems.map((item, index) => (
                <motion.div
                  key={item.name}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: index * 0.03 }}
                >
                  <VfsFileCard
                    item={item}
                    onNavigate={handleFolderNavigate}
                    onFileClick={handleFileClick}
                    onDownload={handleDownload}
                    onDelete={!isReadOnly ? handleDelete : undefined}
                    isReadOnly={isReadOnly}
                    t={t}
                  />
                </motion.div>
              ))}
            </motion.div>
          ) : (
            /* List view */
            <motion.div
              key={`list-${vfsPath}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-4"
            >
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                    <th className="py-2 px-4 font-medium">{t.app.name}</th>
                    <th className="py-2 px-4 font-medium hidden md:table-cell">{t.app.size}</th>
                    <th className="py-2 px-4 font-medium hidden sm:table-cell">{t.app.type}</th>
                    <th className="py-2 px-4 font-medium hidden lg:table-cell">{t.app.modified}</th>
                    <th className="py-2 px-4 font-medium w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedItems.map((item) => (
                    <VfsFileRow
                      key={item.name}
                      item={item}
                      onNavigate={handleFolderNavigate}
                      onFileClick={handleFileClick}
                      onDownload={handleDownload}
                      onDelete={!isReadOnly ? handleDelete : undefined}
                      isReadOnly={isReadOnly}
                      t={t}
                    />
                  ))}
                </tbody>
              </table>
            </motion.div>
          )}
        </AnimatePresence>
      </ScrollArea>

      {/* New Folder Dialog */}
      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderPlus className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              {t.app.newFolder}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder={t.app.enterFolderName}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && newFolderName.trim()) {
                  handleCreateFolder();
                }
              }}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => { setNewFolderOpen(false); setNewFolderName(""); }}
              disabled={creatingFolder}
            >
              {t.app.cancel}
            </Button>
            <Button
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim() || creatingFolder}
              className="bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white"
            >
              {creatingFolder ? t.app.creatingFolder : t.app.createFolder}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
