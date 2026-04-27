"use client";

import { Folder, Star, Trash2, HardDrive, Cloud, Menu, X, Clock, Settings, LogOut, Shield, Zap, Package, Server, Globe, Network, Upload, Download, Pencil, Share2, FolderInput, Copy, FolderPlus, ChevronDown, ChevronRight, RefreshCw, Unplug } from "lucide-react";
import { useFileStore, type Section, type MountedDriver, type VfsBreadcrumbItem } from "@/store/file-store";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "next-themes";
import { useSession, signOut } from "next-auth/react";
import { Moon, Sun } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { formatFileSize, type StorageStats } from "@/lib/file-utils";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useI18n } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/language-switcher";


function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

// Driver type display names
const driverDisplayNames: Record<string, string> = {
  local: "本地存储",
  baidu: "百度网盘",
  aliyun: "阿里云盘",
  onedrive: "OneDrive",
  google: "Google Drive",
  s3: "S3 存储",
  webdav: "WebDAV",
  ftp: "FTP",
  mount: "挂载盘",
  "115": "115网盘",
  quark: "夸克网盘",
};

function DriverStatusSection() {
  const {
    currentDriverId, setCurrentDriverId, setSection, vfsMode, vfsPath,
    setVfsMode, setVfsPath, browseDriver, mountedDrivers, setMountedDrivers,
    navigateToVfsPath,
  } = useFileStore();
  const { t } = useI18n();
  const [expandedDrivers, setExpandedDrivers] = useState<Set<string>>(new Set());

  // Fetch drivers from admin API
  const { data: driversData } = useQuery({
    queryKey: ["sidebar-drivers"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/admin/drivers");
        if (!res.ok) return null;
        return res.json();
      } catch {
        return null;
      }
    },
    refetchInterval: 60000,
  });

  // Fetch storage stats for usage bars
  const { data: storageStats } = useQuery<StorageStats>({
    queryKey: ["storage-stats"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/files/stats");
        if (!res.ok) throw new Error("Failed");
        return res.json();
      } catch {
        return null;
      }
    },
    refetchInterval: 60000,
  });

  // Fetch VFS mount points with enriched data
  const { data: vfsData } = useQuery({
    queryKey: ["vfs-mounts"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/vfs?action=mounts");
        if (!res.ok) throw new Error("Failed to fetch VFS mounts");
        return res.json();
      } catch {
        return null;
      }
    },
    refetchInterval: 30000,
  });

  // Update mounted drivers in store
  const vfsMounts = vfsData?.mounts || [];
  const dbDrivers: { id: string; name: string; type: string; status: string; healthy?: boolean }[] = driversData?.drivers || [];

  // Always show at least the local default driver
  const displayDrivers = dbDrivers.length > 0 ? dbDrivers : [
    { id: "default-local", name: "本地存储", type: "local", status: "active", healthy: true },
  ];

  // Sync mounted drivers to store
  const mounted: MountedDriver[] = vfsMounts.map((mount: any) => ({
    id: mount.driverId,
    name: mount.driverName || driverDisplayNames[mount.driverType] || mount.driverType,
    type: mount.driverType,
    mountPath: mount.mountPath,
    status: mount.driverStatus || mount.status || "active",
    authStatus: mount.authStatus || "authorized",
    isReadOnly: mount.isReadOnly || false,
    isDefault: mount.driverId === "local-default",
  }));

  // Sync mounted drivers to store (using useEffect to avoid render-loop)
  useEffect(() => {
    if (mounted.length > 0 && mountedDrivers.length !== mounted.length) {
      setMountedDrivers(mounted);
    }
  }, [mounted.length, mountedDrivers.length]);

  const getDriverIcon = (type: string) => {
    switch (type) {
      case "local": return Server;
      case "webdav": return Globe;
      case "s3": return Cloud;
      case "mount": return Network;
      case "ftp": return Globe;
      case "baidu": return Cloud;
      case "aliyun": return Cloud;
      case "onedrive": return Cloud;
      case "google": return Cloud;
      case "115": return HardDrive;
      case "quark": return HardDrive;
      default: return Cloud;
    }
  };

  const getStatusColor = (driver: { status: string; healthy?: boolean; authStatus?: string }) => {
    if (driver.status === "active" && driver.healthy !== false && driver.authStatus !== "expired" && driver.authStatus !== "error") return "bg-emerald-500";
    if (driver.status === "error" || driver.healthy === false || driver.authStatus === "error") return "bg-red-500";
    if (driver.authStatus === "expired") return "bg-amber-500";
    return "bg-gray-400";
  };

  const handleDriverClick = (driver: { id: string; name: string; type: string }) => {
    const isDefault = driver.id === "default-local" || driver.id === "local-default";
    const driverId = isDefault ? "local-default" : driver.id;
    const driverName = driver.name || driverDisplayNames[driver.type] || driver.type;

    // Find mount path for this driver
    const mountInfo = vfsMounts.find((m: any) => m.driverId === driverId);
    const mountPath = mountInfo?.mountPath || (isDefault ? "/local" : `/${driver.type}-${driver.id.substring(0, 8)}`);

    // Toggle expand
    setExpandedDrivers((prev) => {
      const next = new Set(prev);
      if (next.has(driverId)) {
        next.delete(driverId);
      } else {
        next.add(driverId);
      }
      return next;
    });

    // Browse this driver's files
    browseDriver(driverId, driverName, driver.type, mountPath);
  };

  const handleVfsBrowse = (mountPath: string, driverId: string, driverType: string) => {
    setVfsMode(true);
    setVfsPath(mountPath);
    setSection("files");
  };

  const isDriverActive = (driverId: string) => {
    const normalizedId = driverId === "default-local" ? "local-default" : driverId;
    return currentDriverId === normalizedId || (currentDriverId === null && normalizedId === "local-default");
  };

  return (
    <div className="border-t border-border/40 mx-3 pt-3 pb-1">
      <div className="px-2 mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">{t.app.drivers}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-medium">
              {vfsMounts.length} {vfsMounts.length === 1 ? "mount" : "mounts"}
            </span>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">
            {vfsMounts.length} storage driver{vfsMounts.length !== 1 ? "s" : ""} mounted in VFS
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="space-y-0.5">
        {displayDrivers.slice(0, 5).map((driver) => {
          const Icon = getDriverIcon(driver.type);
          const isActive = isDriverActive(driver.id);
          const isExpanded = expandedDrivers.has(driver.id === "default-local" ? "local-default" : driver.id);
          const driverId = driver.id === "default-local" ? "local-default" : driver.id;
          const mountInfo = vfsMounts.find((m: any) => m.driverId === driverId);
          const displayName = driver.name || driverDisplayNames[driver.type] || driver.type;
          const mountPath = mountInfo?.mountPath || (driverId === "local-default" ? "/local" : `/${driver.type}`);
          const authStatus = (mountInfo as any)?.authStatus || "authorized";

          return (
            <div key={driver.id}>
              <button
                onClick={() => handleDriverClick(driver)}
                className={cn(
                  "flex w-full items-center gap-2 px-2 py-1.5 rounded-md text-[11px] transition-all duration-200 cursor-pointer",
                  isActive
                    ? "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/20"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                <div className="relative">
                  <Icon className={cn("w-3.5 h-3.5 shrink-0", isActive && "text-emerald-600 dark:text-emerald-400")} />
                  <div className={cn(
                    "absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-background",
                    getStatusColor({ status: driver.status, healthy: driver.healthy, authStatus })
                  )} />
                </div>
                <span className="truncate flex-1 text-left">{displayName}</span>
                {isActive && (
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                )}
                {!isActive && (
                  <span className={cn(
                    "text-[9px] font-medium",
                    driver.status === "active" && driver.healthy !== false ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"
                  )}>
                    {authStatus === "expired" ? "Expired" :
                     authStatus === "error" ? "Error" :
                     driver.status === "active" && driver.healthy !== false ? t.app.driverActive : driver.status === "error" ? t.app.driverError : t.app.driverInactive}
                  </span>
                )}
                {/* Expand/collapse chevron */}
                <motion.div
                  animate={{ rotate: isExpanded ? 90 : 0 }}
                  transition={{ duration: 0.15 }}
                  className="shrink-0"
                >
                  <ChevronRight className="w-3 h-3 text-muted-foreground/50" />
                </motion.div>
              </button>

              {/* Expanded driver info */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <div className="ml-5 pl-3 border-l border-border/30 space-y-0.5 py-1">
                      {/* Mount path */}
                      <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-muted-foreground">
                        <FolderInput className="w-2.5 h-2.5" />
                        <span className="truncate">Mount: {mountPath}</span>
                      </div>

                      {/* Read-only badge */}
                      {mountInfo?.isReadOnly && (
                        <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-amber-600">
                          <Unplug className="w-2.5 h-2.5" />
                          <span>Read-only</span>
                        </div>
                      )}

                      {/* Browse files button */}
                      <button
                        onClick={() => handleVfsBrowse(mountPath, driverId, driver.type)}
                        className={cn(
                          "flex items-center gap-1.5 px-2 py-1 w-full text-[10px] rounded transition-colors",
                          "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                        )}
                      >
                        <Folder className="w-2.5 h-2.5" />
                        <span>Browse Files</span>
                      </button>

                      {/* Driver type info */}
                      <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-muted-foreground/60">
                        <HardDrive className="w-2.5 h-2.5" />
                        <span className="capitalize">{driverDisplayNames[driver.type] || driver.type}</span>
                      </div>

                      {/* Storage usage bar */}
                      {(() => {
                        const used = storageStats?.usedBytes ?? 0;
                        const total = storageStats?.totalBytes ?? 10737418240;
                        const pct = total > 0 ? (used / total) * 100 : 0;
                        return (
                          <div className="px-2 py-1 space-y-0.5">
                            <div className="flex items-center justify-between text-[9px] text-muted-foreground/70">
                              <span>Storage</span>
                              <span>{formatFileSize(used)}/{formatFileSize(total)}</span>
                            </div>
                            <div className="h-1 rounded-full bg-muted/50 overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all duration-500",
                                  pct > 80 ? "bg-red-500" : pct > 60 ? "bg-amber-500" : "bg-emerald-500"
                                )}
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
        {displayDrivers.length > 5 && (
          <p className="text-[10px] text-muted-foreground/60 px-2">+{displayDrivers.length - 5} more</p>
        )}
      </div>

      {/* VFS Mount Points */}
      {vfsMounts.length > 0 && (
        <div className="mt-2 space-y-0.5">
          <div className="flex items-center gap-1.5 px-2 py-1">
            <HardDrive className="w-3 h-3 text-muted-foreground/60" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">VFS Mounts</span>
          </div>
          <AnimatePresence>
            {vfsMounts.map((mount: any) => {
              const isCurrentVfsPath = vfsMode && vfsPath === mount.mountPath;
              return (
                <motion.button
                  key={mount.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className={cn(
                    "flex items-center gap-2 w-full px-2 py-1.5 text-[11px] rounded-md transition-all",
                    "hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground cursor-pointer",
                    isCurrentVfsPath && "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
                  )}
                  onClick={() => navigateToVfsPath(mount.mountPath, mount.driverId, mount.driverType)}
                >
                  {(() => {
                    const MIcon = getDriverIcon(mount.driverType);
                    return <MIcon className="w-3.5 h-3.5 shrink-0" />;
                  })()}
                  <span className="truncate flex-1 text-left">{mount.mountPath.replace(/^\/+/, '')}</span>
                  <span className={cn(
                    "ml-auto w-1.5 h-1.5 rounded-full shrink-0",
                    mount.isReadOnly ? "bg-amber-500" : "bg-emerald-500"
                  )} />
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

// Recent Activity mini-list component
const activityIconConfig: Record<string, { icon: typeof Upload; color: string }> = {
  upload: { icon: Upload, color: "text-emerald-500" },
  download: { icon: Download, color: "text-sky-500" },
  rename: { icon: Pencil, color: "text-amber-500" },
  delete: { icon: Trash2, color: "text-destructive" },
  star: { icon: Star, color: "text-yellow-500" },
  share: { icon: Share2, color: "text-purple-500" },
  move: { icon: FolderInput, color: "text-blue-500" },
  copy: { icon: Copy, color: "text-teal-500" },
  create: { icon: FolderPlus, color: "text-emerald-500" },
};

function formatTimeAgoMini(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function RecentActivityList() {
  const { activities } = useFileStore();
  const recentActivities = activities.slice(0, 3);

  if (recentActivities.length === 0) return null;

  return (
    <div className="border-t border-border/40 mx-3 pt-2 pb-1">
      <div className="px-2 mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Recent</span>
      </div>
      <div className="space-y-0.5">
        {recentActivities.map((activity) => {
          const config = activityIconConfig[activity.action] || { icon: Upload, color: "text-muted-foreground" };
          const Icon = config.icon;
          return (
            <div
              key={activity.id}
              className="flex items-center gap-2 px-2 py-1 rounded-md text-[11px] text-muted-foreground hover:bg-sidebar-accent/30 transition-colors"
            >
              <Icon className={cn("w-3 h-3 shrink-0", config.color)} />
              <span className="truncate flex-1">{activity.fileName}</span>
              <span className="text-[9px] text-muted-foreground/60 shrink-0">{formatTimeAgoMini(activity.timestamp)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { section, setSection, sidebarOpen, setSidebarOpen, setPreferencesOpen, setAdminPanelOpen, currentDriverId, currentDriverName, setCurrentDriverId, setMyDrivesOpen } = useFileStore();
  const { theme, setTheme } = useTheme();
  const { data: sessionData } = useSession();
  const isAdmin = (sessionData?.user as Record<string, unknown>)?.role === "admin";
  const [showStorageDetail, setShowStorageDetail] = useState(false);
  const { t } = useI18n();

  const navItems: { id: Section; label: string; icon: typeof Folder }[] = [
    { id: "files", label: t.app.allFiles, icon: Folder },
    { id: "recent", label: t.app.recent, icon: Clock },
    { id: "starred", label: t.app.starred, icon: Star },
    { id: "quick-transfer", label: t.app.quickTransfer, icon: Zap },
    { id: "transfer-station", label: t.app.transferStation, icon: Package },
    { id: "trash", label: t.app.trash, icon: Trash2 },
  ];

  const { data: stats } = useQuery<StorageStats>({
    queryKey: ["storage-stats"],
    queryFn: async () => {
      const res = await fetch("/api/files/stats");
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const usedBytes = stats?.usedBytes ?? 0;
  const totalBytes = stats?.totalBytes ?? 10737418240; // 10 GB default
  const usagePercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40">
        <div className="group/logo relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-lg shadow-emerald-500/25 dark:shadow-emerald-500/10 overflow-hidden">
          <Cloud className="w-5 h-5 relative z-10" />
          {/* Shimmer effect on hover */}
          <div className="absolute inset-0 -translate-x-full group-hover/logo:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
        </div>
        <div className="flex flex-col">
          <span className="text-lg font-bold tracking-tight leading-tight bg-gradient-to-r from-emerald-600 to-emerald-800 dark:from-emerald-400 dark:to-emerald-600 bg-clip-text text-transparent">CloudDrive</span>
          <span className="text-[10px] text-muted-foreground leading-tight">{t.app.personalCloudStorage}</span>
        </div>
        {onNavigate && (
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto md:hidden"
            onClick={onNavigate}
          >
            <X className="w-5 h-5" />
          </Button>
        )}
      </div>

      {/* Navigation */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="px-5 py-3">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">{t.app.navigation}</span>
          </div>
          <nav className="space-y-0.5 px-3">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = section === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setSection(item.id);
                    onNavigate?.();
                  }}
                  className={cn(
                    "relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 hover:scale-[1.01]",
                    isActive
                      ? "bg-gradient-to-r from-emerald-600/10 to-emerald-600/5 text-emerald-700 dark:text-emerald-400 shadow-sm shadow-emerald-500/10 nav-item-glow active"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground hover:translate-x-0.5 nav-item-glow"
                  )}
                >
                  {/* Active indicator bar */}
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-active-indicator"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-emerald-600 dark:bg-emerald-400"
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    />
                  )}
                  <Icon
                    className={cn(
                      "w-5 h-5 transition-colors",
                      isActive && "text-emerald-600 dark:text-emerald-400"
                    )}
                  />
                  {item.label}
                  {/* Driver indicator on All Files nav item */}
                  {item.id === "files" && currentDriverId && (
                    <div className="ml-1 flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 truncate max-w-[80px]">{currentDriverName}</span>
                    </div>
                  )}
                  {item.id === "starred" && (stats?.starredCount ?? 0) > 0 && (
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={stats.starredCount}
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.5, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 500, damping: 25 }}
                      >
                        <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-[10px]">
                          {stats.starredCount}
                        </Badge>
                      </motion.div>
                    </AnimatePresence>
                  )}
                  {item.id === "trash" && (stats?.trashedCount ?? 0) > 0 && (
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={stats.trashedCount}
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.5, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 500, damping: 25 }}
                      >
                        <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-[10px]">
                          {stats.trashedCount}
                        </Badge>
                      </motion.div>
                    </AnimatePresence>
                  )}
                </button>
              );
            })}
          </nav>
          {/* My Drives button */}
          <div className="px-3 pt-2">
            <button
              onClick={() => {
                setMyDrivesOpen(true);
                onNavigate?.();
              }}
              className="relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 hover:scale-[1.01] text-sidebar-foreground/70 hover:bg-purple-600/10 hover:text-purple-700 dark:hover:text-purple-400 hover:translate-x-0.5"
            >
              <HardDrive className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              我的驱动
              <ChevronRight className="w-3.5 h-3.5 ml-auto text-muted-foreground/50" />
            </button>
          </div>
          {/* Admin Panel Button inside scroll area - clearly separated */}
          {isAdmin && (
            <div className="border-t border-border/60 px-4 py-3 mt-3 mx-1">
              <button
                onClick={() => {
                  setAdminPanelOpen(true);
                  onNavigate?.();
                }}
                className="relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 hover:scale-[1.01] text-sidebar-foreground/70 hover:bg-emerald-600/10 hover:text-emerald-700 dark:hover:text-emerald-400 hover:translate-x-0.5"
              >
                <Shield className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" />
                {t.app.adminPanel}
              </button>
            </div>
          )}
          {/* Storage Drivers Status */}
          <DriverStatusSection />

          {/* Quick Stats */}
          <div className="px-5 py-2 border-t border-border/40 mx-3">
            <p className="text-[11px] text-muted-foreground/70">
              {stats?.totalFiles ?? 0} {t.app.files} · {stats?.totalFolders ?? 0} {t.app.folders}
            </p>
          </div>

          {/* Recent Activity Mini-list */}
          <RecentActivityList />
        </ScrollArea>
      </div>

      {/* User Profile Area */}
      <div className="border-t border-border/40 px-3 py-3">
        <motion.div
          whileHover={{ scale: 1.01, backgroundColor: "rgba(0,0,0,0.03)" }}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-sidebar-accent/50 transition-all duration-200 cursor-pointer"
          onClick={() => setPreferencesOpen(true)}
        >
          <div className="relative shrink-0">
            <Avatar className="w-9 h-9">
              <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-emerald-700 text-white font-bold text-sm shadow-sm shadow-emerald-500/20 dark:shadow-emerald-500/10">
                {sessionData?.user?.name?.charAt(0)?.toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            {/* Ring effect */}
            <div className="absolute -inset-1 rounded-full ring-2 ring-emerald-500/20 dark:ring-emerald-400/20" />
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-sm font-semibold truncate leading-tight">{sessionData?.user?.name || "My CloudDrive"}</span>
            <span className="text-[11px] text-muted-foreground leading-tight truncate">
              {sessionData?.user?.email || `${formatFileSize(usedBytes)} ${t.app.of} ${formatFileSize(totalBytes)} ${t.app.used}`}
            </span>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-md shrink-0"
                onClick={(e) => { e.stopPropagation(); setPreferencesOpen(true); }}
              >
                <Settings className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              {t.app.preferences}
            </TooltipContent>
          </Tooltip>
        </motion.div>
        {/* Theme toggle row */}
        <div className="flex items-center justify-between gap-2 mt-1.5 px-3">
          <div className="flex items-center gap-2">
            {theme === "dark" ? <Moon className="w-3.5 h-3.5 text-muted-foreground" /> : <Sun className="w-3.5 h-3.5 text-muted-foreground" />}
            <span className="text-[11px] text-muted-foreground">{theme === "dark" ? t.app.darkMode : t.app.lightMode}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Switch
              checked={theme === "dark"}
              onCheckedChange={(checked) => {
                document.documentElement.classList.add("theme-transitioning");
                setTheme(checked ? "dark" : "light");
                setTimeout(() => {
                  document.documentElement.classList.remove("theme-transitioning");
                }, 350);
              }}
              className="scale-90"
            />
          </div>
        </div>
        {/* Language switcher row */}
        <div className="flex items-center justify-between gap-2 mt-1.5 px-3">
          <LanguageSwitcher variant="ghost" />
        </div>
        {/* Sign out button */}
        <div className="mt-2 px-3">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive h-8 px-2 text-xs"
            onClick={() => signOut({ redirect: false })}
          >
            <LogOut className="w-3.5 h-3.5" />
            {t.app.signOut}
          </Button>
        </div>
      </div>

      {/* Storage Stats - More prominent */}
      <div className="border-t border-border/40" data-storage-section>
        <button
          className="w-full px-4 py-4 hover:bg-sidebar-accent/50 transition-colors text-left"
          onClick={() => setShowStorageDetail(!showStorageDetail)}
        >
          <div className="flex items-center gap-2 mb-2.5">
            <HardDrive className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-xs font-bold uppercase tracking-wider">{t.app.storage}</span>
            <motion.div
            animate={{ rotate: showStorageDetail ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="ml-auto"
          >
            <ChevronIcon className="w-3.5 h-3.5 text-muted-foreground" />
          </motion.div>
          </div>
          <Progress value={usagePercent} className={cn("h-1.5 mb-2", usagePercent > 80 && "animate-storage-pulse")} />
          {stats?.byType && Object.keys(stats.byType).length > 0 && (
            <div className="flex h-1 rounded-full overflow-hidden bg-muted/50">
              {Object.entries(stats.byType)
                .sort(([, a], [, b]) => (b as number) - (a as number))
                .map(([type, size]) => {
                  const percent = totalBytes > 0 ? ((size as number) / totalBytes) * 100 : 0;
                  return (
                    <div
                      key={type}
                      className={cn(
                        "h-full transition-all",
                        type === "image" && "bg-emerald-500",
                        type === "video" && "bg-rose-500",
                        type === "audio" && "bg-purple-500",
                        type === "document" && "bg-sky-500",
                        type === "code" && "bg-amber-500",
                        type === "archive" && "bg-orange-500",
                        type === "other" && "bg-gray-500",
                      )}
                      style={{ width: `${percent}%` }}
                    />
                  );
                })}
            </div>
          )}
          <div className="flex items-center justify-between mt-1.5">
            <p className="text-[11px] text-muted-foreground">
              {formatFileSize(usedBytes)} {t.app.of} {formatFileSize(totalBytes)}
            </p>
            <p className="text-[11px] font-semibold">
              {usagePercent.toFixed(usagePercent < 1 ? 2 : 0)}%
            </p>
          </div>
        </button>

        {/* Storage detail panel - expandable with animation */}
        <AnimatePresence initial={false}>
          {showStorageDetail && stats?.byType && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-3 space-y-1.5 border-t border-border/40 pt-2">
                {Object.entries(stats.byType)
                  .sort(([, a], [, b]) => (b as number) - (a as number))
                  .map(([type, size]) => (
                    <div key={type} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-2.5 h-2.5 rounded-full",
                          type === "image" && "bg-emerald-500",
                          type === "video" && "bg-rose-500",
                          type === "audio" && "bg-purple-500",
                          type === "document" && "bg-sky-500",
                          type === "code" && "bg-amber-500",
                          type === "archive" && "bg-orange-500",
                          type === "other" && "bg-gray-500",
                        )} />
                        <span className="capitalize">{type}</span>
                      </div>
                      <span className="text-muted-foreground">{formatFileSize(size as number)}</span>
                    </div>
                  ))}
                <div className="border-t border-border/40 pt-1.5 mt-1.5 flex items-center justify-between text-xs font-medium">
                  <span>{t.app.free}</span>
                  <span className="text-muted-foreground">{formatFileSize(totalBytes - usedBytes)}</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function FileSidebar() {
  const isMobile = useIsMobile();
  const { sidebarOpen, setSidebarOpen } = useFileStore();
  const { t } = useI18n();

  if (isMobile) {
    return (
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-72 p-0 backdrop-blur-sm">
          <SheetTitle className="sr-only">{t.app.navigation}</SheetTitle>
          <SidebarContent onNavigate={() => setSidebarOpen(false)} />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside className="hidden md:flex w-[260px] shrink-0 border-r border-border/60 dark:border-border/40 transition-all duration-300">
      <SidebarContent />
    </aside>
  );
}

export function MobileMenuButton() {
  const { setSidebarOpen } = useFileStore();

  return (
    <Button
      variant="ghost"
      size="icon"
      className="md:hidden"
      onClick={() => setSidebarOpen(true)}
    >
      <Menu className="w-5 h-5" />
    </Button>
  );
}
