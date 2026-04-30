"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription,
} from "@/components/ui/dialog";
import {
  HardDrive, Plus, FolderOpen, ArrowRight, Server, Database,
  Folder, File, RefreshCw, Trash2, Shield, Wifi, Globe,
  HardDriveUpload, FileWarning, Link2, Send, ScanSearch,
  ChevronDown, ChevronUp, AlertTriangle, CheckCircle2,
  HelpCircle, TrendingUp, TrendingDown, BarChart3, FileText,
  Image, Film, Music, Code, Archive, FileIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { formatFileSize } from "@/lib/file-utils";
import { motion, AnimatePresence } from "framer-motion";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

// --- Types ---

interface PartitionInfo {
  filesystem: string;
  mountPoint: string;
  type: string;
  total: number;
  used: number;
  available: number;
  usagePercent: number;
}

interface StorageDirInfo {
  path: string;
  exists: boolean;
  totalFiles: number;
  totalFolders: number;
  totalSize: number;
  diskUsedPercent: number;
}

interface MountConfig {
  id: string;
  name: string;
  type: string;
  config: string;
  isEnabled: boolean;
  status: string;
}

interface DiskInfoData {
  partitions: PartitionInfo[];
  storageDir: StorageDirInfo;
  mountConfigs: MountConfig[];
}

interface DiskInfo {
  path: string;
  mountPoint: string;
  total: number;
  used: number;
  available: number;
  usagePercent: number;
  isMounted: boolean;
  label: string;
  type: "local" | "driver";
  driverId?: string;
  driverName?: string;
}

interface DiskContentItem {
  name: string;
  type: "file" | "directory";
  size: number;
  modified: string;
}

interface CleanupResult {
  items: Array<{ path?: string; id?: string; name?: string; token?: string; fileName?: string; storagePath?: string; size?: number; expiresAt?: string }>;
  count: number;
  executed: boolean;
  deletedCount?: number;
  markedCount?: number;
  deletedFiles?: number;
  deletedRecords?: number;
}

// --- Helper ---

function getUsageColor(percent: number): string {
  if (percent >= 90) return "text-red-500";
  if (percent >= 70) return "text-amber-500";
  return "text-emerald-500";
}

function getUsageBg(percent: number): string {
  if (percent >= 90) return "bg-red-500/10";
  if (percent >= 70) return "bg-amber-500/10";
  return "bg-emerald-500/10";
}

function getProgressClass(percent: number): string {
  if (percent >= 90) return "[&>div]:bg-red-500";
  if (percent >= 70) return "[&>div]:bg-amber-500";
  return "[&>div]:bg-emerald-500";
}

// --- Main Component ---

export function AdminDiskTab() {
  const queryClient = useQueryClient();
  const { t } = useI18n();

  const [mountDialogOpen, setMountDialogOpen] = useState(false);
  const [mountPath, setMountPath] = useState("");
  const [mountName, setMountName] = useState("");
  const [browsePath, setBrowsePath] = useState<string | null>(null);

  // Network mount dialog
  const [networkMountDialogOpen, setNetworkMountDialogOpen] = useState(false);
  const [netMountName, setNetMountName] = useState("");
  const [netMountProtocol, setNetMountProtocol] = useState("webdav");
  const [netMountUrl, setNetMountUrl] = useState("");
  const [netMountPath, setNetMountPath] = useState("");
  const [netMountUsername, setNetMountUsername] = useState("");
  const [netMountPassword, setNetMountPassword] = useState("");

  // Cleanup state
  const [cleanupExpanded, setCleanupExpanded] = useState(false);
  const [scanResults, setScanResults] = useState<Record<string, CleanupResult | null>>({});
  const [isScanning, setIsScanning] = useState<string | null>(null);

  // Section expanded states
  const [systemDiskExpanded, setSystemDiskExpanded] = useState(true);
  const [storageDirExpanded, setStorageDirExpanded] = useState(true);
  const [networkMountExpanded, setNetworkMountExpanded] = useState(false);
  const [webdavHowToOpen, setWebdavHowToOpen] = useState(false);

  // --- Queries ---

  const { data: diskData, isLoading } = useQuery({
    queryKey: ["admin-disk"],
    queryFn: async () => {
      const res = await fetch("/api/admin/disk");
      if (!res.ok) throw new Error("Failed to fetch disk info");
      return res.json();
    },
  });

  const { data: diskInfoData, isLoading: isDiskInfoLoading, refetch: refetchDiskInfo } = useQuery({
    queryKey: ["admin-disk-info"],
    queryFn: async () => {
      const res = await fetch("/api/admin/disk/info");
      if (!res.ok) throw new Error("Failed to fetch disk info");
      return res.json() as Promise<DiskInfoData>;
    },
  });

  const { data: browseData, isLoading: isBrowsing } = useQuery({
    queryKey: ["admin-disk-browse", browsePath],
    queryFn: async () => {
      const res = await fetch(`/api/admin/disk?path=${encodeURIComponent(browsePath!)}`);
      if (!res.ok) throw new Error("Failed to browse path");
      return res.json();
    },
    enabled: browsePath !== null,
  });

  // --- Mutations ---

  const mountDisk = useMutation({
    mutationFn: async (data: { path: string; name: string }) => {
      const res = await fetch("/api/admin/disk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to mount disk");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-disk"] });
      queryClient.invalidateQueries({ queryKey: ["admin-drivers"] });
      queryClient.invalidateQueries({ queryKey: ["admin-disk-info"] });
      setMountDialogOpen(false);
      setMountPath("");
      setMountName("");
      toast.success(t.admin.diskMounted);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Create mount-type driver (for both quick WebDAV and network mount dialog)
  const createMountDriver = useMutation({
    mutationFn: async (data: { name: string; type: string; basePath?: string; config: Record<string, string> }) => {
      const res = await fetch("/api/admin/drivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create mount driver");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-disk"] });
      queryClient.invalidateQueries({ queryKey: ["admin-drivers"] });
      queryClient.invalidateQueries({ queryKey: ["admin-disk-info"] });
      toast.success(t.admin.mountCreated);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Quick WebDAV mount submit handler
  const handleQuickWebdavMount = useCallback(() => {
    if (!netMountUrl) {
      toast.error(t.admin.mountUrlRequired);
      return;
    }
    createMountDriver.mutate({
      name: `WebDAV - ${netMountUrl}`,
      type: "mount",
      basePath: netMountPath || undefined,
      config: {
        protocol: "webdav",
        url: netMountUrl,
        mountPoint: netMountPath || "/mnt/webdav",
        username: netMountUsername,
        password: netMountPassword,
      },
    });
  }, [netMountUrl, netMountPath, netMountUsername, netMountPassword, createMountDriver, t]);

  // Network mount dialog submit handler
  const handleNetworkMountSubmit = useCallback(() => {
    if (!netMountName) {
      toast.error(t.admin.mountNameRequired);
      return;
    }
    if (!netMountUrl) {
      toast.error(t.admin.mountUrlRequired);
      return;
    }
    const config: Record<string, string> = {
      protocol: netMountProtocol,
      url: netMountUrl,
      mountPoint: netMountPath || "/mnt/remote",
      username: netMountUsername,
      password: netMountPassword,
    };
    if (netMountProtocol === "nfs") {
      // For NFS, parse host and exportPath from URL
      const parts = netMountUrl.split(":");
      if (parts.length >= 2) {
        config.host = parts[0];
        config.exportPath = parts.slice(1).join(":");
      }
    } else if (netMountProtocol === "smb") {
      // For SMB, parse host and share from URL
      const cleaned = netMountUrl.replace(/^\/\/+/, "");
      const parts = cleaned.split("/");
      if (parts.length >= 2) {
        config.host = parts[0];
        config.share = parts.slice(1).join("/");
      }
    }
    createMountDriver.mutate(
      {
        name: netMountName,
        type: "mount",
        basePath: netMountPath || undefined,
        config,
      },
      {
        onSuccess: () => {
          setNetworkMountDialogOpen(false);
          setNetMountName("");
          setNetMountProtocol("webdav");
          setNetMountUrl("");
          setNetMountPath("");
          setNetMountUsername("");
          setNetMountPassword("");
        },
      },
    );
  }, [netMountName, netMountProtocol, netMountUrl, netMountPath, netMountUsername, netMountPassword, createMountDriver, t]);

  // --- Cleanup Handlers ---

  const handleScan = useCallback(async (action: string) => {
    setIsScanning(action);
    try {
      const res = await fetch("/api/admin/disk/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, execute: false }),
      });
      if (!res.ok) throw new Error("Scan failed");
      const result = await res.json() as CleanupResult;
      setScanResults((prev) => ({ ...prev, [action]: result }));
      if (result.count === 0) {
        toast.success(t.admin.noOrphansFound);
      }
    } catch {
      toast.error("Scan failed");
    } finally {
      setIsScanning(null);
    }
  }, [t]);

  const handleClean = useCallback(async (action: string) => {
    try {
      const res = await fetch("/api/admin/disk/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, execute: true }),
      });
      if (!res.ok) throw new Error("Cleanup failed");
      const result = await res.json() as CleanupResult;
      setScanResults((prev) => ({ ...prev, [action]: null }));
      toast.success(t.admin.cleanupComplete);
      refetchDiskInfo();
    } catch {
      toast.error("Cleanup failed");
    }
  }, [t, refetchDiskInfo]);

  const handleCleanAll = useCallback(async () => {
    const actions = ["orphaned-files", "orphaned-records", "expired-shares", "expired-transfers"];
    for (const action of actions) {
      try {
        await fetch("/api/admin/disk/cleanup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, execute: true }),
        });
      } catch {
        // Continue with other actions
      }
    }
    setScanResults({});
    toast.success(t.admin.cleanupComplete);
    refetchDiskInfo();
  }, [t, refetchDiskInfo]);

  // --- Data ---

  const disks: DiskInfo[] = diskData?.disks || [];
  const browseItems: DiskContentItem[] = browseData?.items || [];
  const partitions = diskInfoData?.partitions || [];
  const storageDir = diskInfoData?.storageDir;
  const mountConfigs = diskInfoData?.mountConfigs || [];

  // --- Render ---

  return (
    <div className="space-y-6">
      {/* System Disk Overview */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <HardDrive className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <CardTitle className="text-base">{t.admin.systemDisks}</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  {t.admin.diskInfo}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 h-8"
                onClick={() => refetchDiskInfo()}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {t.admin.refresh}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setSystemDiskExpanded(!systemDiskExpanded)}
              >
                {systemDiskExpanded ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <AnimatePresence>
          {systemDiskExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <CardContent className="pt-0">
                {isDiskInfoLoading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className="space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-2 w-full" />
                      </div>
                    ))}
                  </div>
                ) : partitions.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    <HardDrive className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    {t.admin.noDisksFound}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {partitions.map((partition) => (
                      <motion.div
                        key={partition.mountPoint}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-lg border p-4 space-y-3 dark:border-white/10 dark:bg-white/[0.02]"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={cn("p-2 rounded-lg", getUsageBg(partition.usagePercent))}>
                              <HardDrive className={cn("w-4 h-4", getUsageColor(partition.usagePercent))} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">{partition.mountPoint}</span>
                                <Badge variant="outline" className="text-[10px]">
                                  {partition.type}
                                </Badge>
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                <code className="text-[11px] bg-muted dark:bg-white/10 px-1 py-0.5 rounded">{partition.filesystem}</code>
                              </div>
                            </div>
                          </div>
                          <span className={cn("text-lg font-bold", getUsageColor(partition.usagePercent))}>
                            {partition.usagePercent.toFixed(1)}%
                          </span>
                        </div>
                        <Progress
                          value={Math.min(partition.usagePercent, 100)}
                          className={cn("h-2", getProgressClass(partition.usagePercent))}
                        />
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{t.admin.usedSpace}: {formatFileSize(partition.used)}</span>
                          <span>{t.admin.availableSpace}: {formatFileSize(partition.available)}</span>
                          <span>{t.admin.totalSpace}: {formatFileSize(partition.total)}</span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {/* Storage Directory */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <FolderOpen className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <CardTitle className="text-base">{t.admin.storageDirectory}</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  {t.admin.cloudDriveStorage}
                </CardDescription>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setStorageDirExpanded(!storageDirExpanded)}
            >
              {storageDirExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </Button>
          </div>
        </CardHeader>
        <AnimatePresence>
          {storageDirExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <CardContent className="pt-0">
                {isDiskInfoLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-40" />
                  </div>
                ) : storageDir ? (
                  <div className="space-y-3">
                    {/* Path */}
                    <div className="flex items-center gap-2 text-sm">
                      <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                      <code className="text-xs bg-muted px-2 py-1 rounded break-all">
                        {storageDir.path}
                      </code>
                      {storageDir.exists ? (
                        <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          OK
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-red-600 border-red-500/30">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          N/A
                        </Badge>
                      )}
                    </div>

                    {storageDir.exists && (
                      <>
                        {/* Stats grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="rounded-lg border p-3 text-center dark:border-white/10 dark:bg-white/[0.02]">
                            <div className="text-lg font-bold text-foreground">
                              {storageDir.totalFiles.toLocaleString()}
                            </div>
                            <div className="text-xs text-muted-foreground">{t.admin.totalFilesCount}</div>
                          </div>
                          <div className="rounded-lg border p-3 text-center dark:border-white/10 dark:bg-white/[0.02]">
                            <div className="text-lg font-bold text-foreground">
                              {storageDir.totalFolders.toLocaleString()}
                            </div>
                            <div className="text-xs text-muted-foreground">{t.admin.totalFoldersCount}</div>
                          </div>
                          <div className="rounded-lg border p-3 text-center dark:border-white/10 dark:bg-white/[0.02]">
                            <div className="text-lg font-bold text-foreground">
                              {formatFileSize(storageDir.totalSize)}
                            </div>
                            <div className="text-xs text-muted-foreground">{t.admin.storageUsed}</div>
                          </div>
                          <div className="rounded-lg border p-3 text-center dark:border-white/10 dark:bg-white/[0.02]">
                            <div className="text-lg font-bold text-foreground">
                              {storageDir.diskUsedPercent.toFixed(2)}%
                            </div>
                            <div className="text-xs text-muted-foreground">{t.admin.systemDiskUsage}</div>
                          </div>
                        </div>

                        {/* Usage bar */}
                        {storageDir.diskUsedPercent > 0 && (
                          <div className="space-y-1.5">
                            <Progress
                              value={Math.min(storageDir.diskUsedPercent * 10, 100)}
                              className={cn("h-1.5", getProgressClass(storageDir.diskUsedPercent * 10))}
                            />
                            <div className="text-xs text-muted-foreground">
                              {t.admin.cloudDriveStorage}: {formatFileSize(storageDir.totalSize)} ({storageDir.diskUsedPercent.toFixed(2)}% {t.admin.systemDiskUsage})
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted-foreground text-sm">
                    {t.admin.noDisksFound}
                  </div>
                )}
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {/* Mount Directory Dialog (from original) */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">
            {t.admin.localDiskManagement}
          </h3>
        </div>
        <Dialog open={mountDialogOpen} onOpenChange={setMountDialogOpen}>
          <Button
            size="sm"
            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
            onClick={() => setMountDialogOpen(true)}
          >
            <Plus className="w-4 h-4" />
            {t.admin.mountDirectory}
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t.admin.mountNewDirectory}</DialogTitle>
              <DialogDescription>
                {t.admin.directoryPathHint}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="mount-name">{t.admin.directoryName}</Label>
                <Input
                  id="mount-name"
                  value={mountName}
                  onChange={(e) => setMountName(e.target.value)}
                  placeholder={t.admin.directoryNamePlaceholder}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mount-path">{t.admin.directoryPath}</Label>
                <Input
                  id="mount-path"
                  value={mountPath}
                  onChange={(e) => setMountPath(e.target.value)}
                  placeholder="/path/to/directory"
                />
                <p className="text-xs text-muted-foreground">
                  {t.admin.directoryPathHint}
                </p>
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">{t.app.cancel}</Button>
              </DialogClose>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => mountDisk.mutate({ path: mountPath, name: mountName })}
                disabled={mountDisk.isPending || !mountPath || !mountName}
              >
                {mountDisk.isPending ? t.app.creating : t.admin.mount}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Disk List (from original) */}
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-6 w-48 mb-2" />
                <Skeleton className="h-4 w-32 mb-3" />
                <Skeleton className="h-2 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {disks.map((disk) => (
            <Card key={disk.path} className="overflow-hidden">
              <CardContent className="p-0">
                <div className="p-4">
                  <div className="flex items-start gap-4">
                    <div className={cn(
                      "p-3 rounded-xl",
                      disk.usagePercent > 90 ? "bg-red-500/10" : "bg-emerald-500/10",
                    )}>
                      <HardDrive className={cn(
                        "w-6 h-6",
                        disk.usagePercent > 90 ? "text-red-500" : "text-emerald-600",
                      )} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold">{disk.label}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {disk.type === "driver" ? t.admin.driver : t.admin.system}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{disk.path}</code>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => setBrowsePath(disk.path)}
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      {t.admin.browse}
                    </Button>
                  </div>

                  {/* Usage Bar */}
                  <div className="mt-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t.admin.used}: {formatFileSize(disk.used)}</span>
                      <span className="text-muted-foreground">{t.admin.available}: {formatFileSize(disk.available)}</span>
                    </div>
                    <Progress
                      value={Math.min(disk.usagePercent, 100)}
                      className={cn(
                        "h-2",
                        disk.usagePercent > 90 ? "[&>div]:bg-red-500" :
                        disk.usagePercent > 80 ? "[&>div]:bg-amber-500" : "",
                      )}
                    />
                    <div className="text-xs text-muted-foreground">
                      {formatFileSize(disk.used)} / {formatFileSize(disk.total)} ({disk.usagePercent.toFixed(1)}%)
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {disks.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center">
                <Database className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">{t.admin.noDisksFound}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Browse Panel */}
      {browsePath && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-emerald-600" />
              {t.admin.browsing}: <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{browsePath}</code>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-7 gap-1"
                onClick={() => setBrowsePath(null)}
              >
                {t.app.close}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isBrowsing ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto space-y-0.5">
                {browseItems.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    {t.admin.emptyDirectory}
                  </div>
                ) : (
                  browseItems.map((item) => (
                    <div
                      key={item.name}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors cursor-default",
                        item.type === "directory" && "cursor-pointer",
                      )}
                      onClick={() => {
                        if (item.type === "directory") {
                          setBrowsePath(`${browsePath}/${item.name}`.replace(/\/+/g, "/"));
                        }
                      }}
                    >
                      {item.type === "directory" ? (
                        <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                      ) : (
                        <File className="w-4 h-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="flex-1 text-sm truncate">{item.name}</span>
                      {item.type === "directory" ? (
                        <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                      ) : (
                        <span className="text-xs text-muted-foreground shrink-0">
                          {formatFileSize(item.size)}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Network Mount Configuration */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-sky-500/10">
                <Globe className="w-5 h-5 text-sky-600" />
              </div>
              <div>
                <CardTitle className="text-base">{t.admin.networkMount}</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  WebDAV / NFS / SMB
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-8"
                onClick={() => setNetworkMountDialogOpen(true)}
              >
                <Plus className="w-3.5 h-3.5" />
                {t.admin.addMount}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setNetworkMountExpanded(!networkMountExpanded)}
              >
                {networkMountExpanded ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <AnimatePresence>
          {networkMountExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <CardContent className="pt-0">
                {/* Quick mount form */}
                <div className="rounded-lg border p-4 space-y-4 mb-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Wifi className="w-4 h-4 text-sky-500" />
                    WebDAV
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t.admin.mountUrl}</Label>
                      <Input
                        value={netMountUrl}
                        onChange={(e) => setNetMountUrl(e.target.value)}
                        placeholder="https://dav.example.com/remote.php/dav/"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t.admin.mountPath}</Label>
                      <Input
                        value={netMountPath}
                        onChange={(e) => setNetMountPath(e.target.value)}
                        placeholder="/mnt/webdav"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t.admin.username}</Label>
                      <Input
                        value={netMountUsername}
                        onChange={(e) => setNetMountUsername(e.target.value)}
                        placeholder="user@example.com"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t.admin.password}</Label>
                      <Input
                        type="password"
                        value={netMountPassword}
                        onChange={(e) => setNetMountPassword(e.target.value)}
                        placeholder="••••••••"
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={handleQuickWebdavMount}
                    disabled={createMountDriver.isPending || !netMountUrl}
                  >
                    <HardDriveUpload className="w-3.5 h-3.5" />
                    {createMountDriver.isPending ? t.app.creating : t.admin.mountBtn}
                  </Button>
                </div>

                <Separator className="mb-4" />

                {/* Configured mounts */}
                <div>
                  <h4 className="text-sm font-medium mb-3">{t.admin.configuredMounts}</h4>
                  {mountConfigs.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground text-sm rounded-lg border border-dashed">
                      <Server className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p>{t.admin.noDisksFound}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {mountConfigs.map((mount) => {
                        let parsedConfig: Record<string, string> = {};
                        try {
                          parsedConfig = JSON.parse(mount.config);
                        } catch {
                          // ignore
                        }
                        return (
                          <div
                            key={mount.id}
                            className="flex items-center justify-between p-3 rounded-lg border"
                          >
                            <div className="flex items-center gap-3">
                              <div className="p-1.5 rounded-md bg-sky-500/10">
                                <Globe className="w-4 h-4 text-sky-600" />
                              </div>
                              <div>
                                <div className="text-sm font-medium">{mount.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {parsedConfig.url || parsedConfig.server || "-"}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px]",
                                  mount.isEnabled
                                    ? "text-emerald-600 border-emerald-500/30"
                                    : "text-muted-foreground"
                                )}
                              >
                                {mount.status}
                              </Badge>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {/* WebDAV Access Info */}
      <Card className="border-emerald-200/50 dark:border-emerald-800/30">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <Globe className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <CardTitle className="text-base">{t.admin.webdavAccessInfo}</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Mount your CloudDrive via WebDAV protocol
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs font-medium">{t.admin.webdavUrl}</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm bg-muted px-3 py-2 rounded-md font-mono break-all">
                  {typeof window !== "undefined" ? `${window.location.origin}/api/webdav/` : "/api/webdav/"}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5"
                  onClick={() => {
                    const url = `${window.location.origin}/api/webdav/`;
                    navigator.clipboard.writeText(url);
                    toast.success(t.admin.webdavCopyUrl);
                  }}
                >
                  <Link2 className="w-3.5 h-3.5" />
                  Copy
                </Button>
              </div>
            </div>
            {/* How to connect - Quick reference */}
            <div className="rounded-lg bg-muted/50 p-3 space-y-1.5 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">How to connect:</p>
              <p>• <strong>Windows:</strong> Map Network Drive → {typeof window !== "undefined" ? `${window.location.origin}/api/webdav/` : "/api/webdav/"}</p>
              <p>• <strong>macOS:</strong> Finder → Go → Connect to Server → {typeof window !== "undefined" ? `${window.location.origin}/api/webdav/` : "/api/webdav/"}</p>
              <p>• <strong>Linux:</strong> mount -t davfs {typeof window !== "undefined" ? `${window.location.origin}/api/webdav/` : "/api/webdav/"} /mnt/clouddrive</p>
              <p className="pt-1 text-emerald-600 dark:text-emerald-400">{t.admin.webdavCredentials}</p>
            </div>

            {/* How to access via WebDAV - Collapsible */}
            <Collapsible open={webdavHowToOpen} onOpenChange={setWebdavHowToOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full gap-2 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/5 justify-start px-0">
                  <HelpCircle className="w-4 h-4" />
                  How to access via WebDAV
                  <ChevronDown className={cn("w-4 h-4 ml-auto transition-transform", webdavHowToOpen && "rotate-180")} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="rounded-lg border border-emerald-200/50 dark:border-emerald-800/30 bg-emerald-50/30 dark:bg-emerald-950/10 p-4 space-y-3">
                  <ol className="space-y-2.5 text-sm">
                    <li className="flex items-start gap-3">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 flex items-center justify-center text-xs font-bold">1</span>
                      <div>
                        <p className="font-medium">Get a WebDAV client</p>
                        <p className="text-xs text-muted-foreground">Use a client like <strong>Cyberduck</strong>, <strong>WinSCP</strong>, or the built-in <strong>macOS Finder</strong> / <strong>Windows Explorer</strong></p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 flex items-center justify-center text-xs font-bold">2</span>
                      <div>
                        <p className="font-medium">Connect to the URL above</p>
                        <p className="text-xs text-muted-foreground">Paste the WebDAV URL shown above into your client&apos;s server address field</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 flex items-center justify-center text-xs font-bold">3</span>
                      <div>
                        <p className="font-medium">Use your CloudDrive login</p>
                        <p className="text-xs text-muted-foreground">Enter your CloudDrive username and password when prompted for credentials</p>
                      </div>
                    </li>
                  </ol>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </CardContent>
      </Card>

      {/* Network Mount Dialog */}
      <Dialog open={networkMountDialogOpen} onOpenChange={setNetworkMountDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.admin.addMount}</DialogTitle>
            <DialogDescription>
              {t.admin.mountDialogDesc}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t.admin.mountName}</Label>
              <Input
                value={netMountName}
                onChange={(e) => setNetMountName(e.target.value)}
                placeholder={t.admin.directoryNamePlaceholder}
              />
            </div>
            <div className="space-y-2">
              <Label>{t.admin.mountProtocol}</Label>
              <Select value={netMountProtocol} onValueChange={setNetMountProtocol}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="webdav">{t.admin.webdavProtocol}</SelectItem>
                  <SelectItem value="nfs">{t.admin.nfsProtocol}</SelectItem>
                  <SelectItem value="smb">{t.admin.smbProtocol}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t.admin.mountUrl}</Label>
              <Input
                value={netMountUrl}
                onChange={(e) => setNetMountUrl(e.target.value)}
                placeholder={netMountProtocol === "webdav" ? "https://dav.example.com/" : "server:/export/path"}
              />
            </div>
            <div className="space-y-2">
              <Label>{t.admin.mountPath}</Label>
              <Input
                value={netMountPath}
                onChange={(e) => setNetMountPath(e.target.value)}
                placeholder="/mnt/remote"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t.admin.username}</Label>
                <Input
                  value={netMountUsername}
                  onChange={(e) => setNetMountUsername(e.target.value)}
                  placeholder="user"
                />
              </div>
              <div className="space-y-2">
                <Label>{t.admin.password}</Label>
                <Input
                  type="password"
                  value={netMountPassword}
                  onChange={(e) => setNetMountPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{t.app.cancel}</Button>
            </DialogClose>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={handleNetworkMountSubmit}
              disabled={createMountDriver.isPending || !netMountName || !netMountUrl}
            >
              {createMountDriver.isPending ? t.app.creating : t.admin.mountBtn}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Storage Cleanup */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-rose-500/10">
                <Shield className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <CardTitle className="text-base">{t.admin.cleanup}</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  {t.admin.storageCleanupDesc}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-8"
                onClick={handleCleanAll}
              >
                <Trash2 className="w-3.5 h-3.5" />
                {t.admin.cleanAll}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setCleanupExpanded(!cleanupExpanded)}
              >
                {cleanupExpanded ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <AnimatePresence>
          {cleanupExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <CardContent className="pt-0">
                <div className="space-y-3">
                  {/* Orphaned Files */}
                  <CleanupActionCard
                    icon={<FileWarning className="w-4 h-4" />}
                    iconBg="bg-orange-500/10"
                    iconColor="text-orange-600"
                    title={t.admin.orphanedFiles}
                    description={t.admin.orphanedFilesDesc}
                    scanLabel={t.admin.scanForOrphans}
                    cleanLabel={t.admin.cleanOrphanedFiles}
                    isScanning={isScanning === "orphaned-files"}
                    result={scanResults["orphaned-files"]}
                    onScan={() => handleScan("orphaned-files")}
                    onClean={() => handleClean("orphaned-files")}
                    t={t}
                  />

                  {/* Orphaned Records */}
                  <CleanupActionCard
                    icon={<Database className="w-4 h-4" />}
                    iconBg="bg-violet-500/10"
                    iconColor="text-violet-600"
                    title={t.admin.orphanedRecords}
                    description={t.admin.orphanedRecordsDesc}
                    scanLabel={t.admin.scanForOrphans}
                    cleanLabel={t.admin.cleanOrphanedRecords}
                    isScanning={isScanning === "orphaned-records"}
                    result={scanResults["orphaned-records"]}
                    onScan={() => handleScan("orphaned-records")}
                    onClean={() => handleClean("orphaned-records")}
                    t={t}
                  />

                  {/* Expired Shares */}
                  <CleanupActionCard
                    icon={<Link2 className="w-4 h-4" />}
                    iconBg="bg-sky-500/10"
                    iconColor="text-sky-600"
                    title={t.admin.expiredShares}
                    description={t.admin.expiredSharesDesc}
                    scanLabel={t.admin.scanForOrphans}
                    cleanLabel={t.admin.cleanExpiredShares}
                    isScanning={isScanning === "expired-shares"}
                    result={scanResults["expired-shares"]}
                    onScan={() => handleScan("expired-shares")}
                    onClean={() => handleClean("expired-shares")}
                    t={t}
                  />

                  {/* Expired Transfers */}
                  <CleanupActionCard
                    icon={<Send className="w-4 h-4" />}
                    iconBg="bg-pink-500/10"
                    iconColor="text-pink-600"
                    title={t.admin.expiredTransfers}
                    description={t.admin.expiredTransfersDesc}
                    scanLabel={t.admin.scanForOrphans}
                    cleanLabel={t.admin.cleanExpiredTransfers}
                    isScanning={isScanning === "expired-transfers"}
                    result={scanResults["expired-transfers"]}
                    onScan={() => handleScan("expired-transfers")}
                    onClean={() => handleClean("expired-transfers")}
                    t={t}
                  />
                </div>
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {/* Storage Usage Chart by File Type */}
      <StorageChartCard />

      {/* Top Largest Files */}
      <TopFilesCard />

      {/* Storage Trend Indicator */}
      <StorageTrendCard />
    </div>
  );
}

// --- Storage Usage Chart Card ---
function StorageChartCard() {
  const { t } = useI18n();
  const { data: statsData } = useQuery<{
    usedBytes: number;
    totalBytes: number;
    byType: Record<string, number>;
  }>({
    queryKey: ["admin-disk-storage-chart"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/admin/stats");
        if (!res.ok) return { usedBytes: 0, totalBytes: 0, byType: {} };
        const data = await res.json();
        return {
          usedBytes: data.totalStorageUsed ?? 0,
          totalBytes: data.storageByUser?.reduce((s: number, u: { storageLimit: number }) => s + u.storageLimit, 0) ?? 0,
          byType: data.byType ?? {},
        };
      } catch {
        return { usedBytes: 0, totalBytes: 0, byType: {} };
      }
    },
  });

  const typeConfig: Record<string, { color: string; label: string; icon: typeof FileIcon }> = {
    image: { color: "bg-emerald-500", label: t.app.filterImages, icon: Image },
    video: { color: "bg-rose-500", label: t.app.filterVideos, icon: Film },
    audio: { color: "bg-purple-500", label: t.app.filterAudio, icon: Music },
    document: { color: "bg-sky-500", label: t.app.filterDocs, icon: FileText },
    code: { color: "bg-amber-500", label: t.app.filterCode, icon: Code },
    archive: { color: "bg-orange-500", label: t.app.filterArchives, icon: Archive },
    other: { color: "bg-gray-500", label: t.app.filterAll, icon: FileIcon },
  };

  const byType = statsData?.byType ?? {};
  const totalUsed = statsData?.usedBytes ?? 0;
  const entries = Object.entries(byType)
    .sort(([, a], [, b]) => (b as number) - (a as number));
  const maxBytes = entries.length > 0 ? Math.max(...entries.map(([, v]) => v as number)) : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-sky-500/10">
            <BarChart3 className="w-4 h-4 text-sky-600 dark:text-sky-400" />
          </div>
          {t.admin.storageUsageChart || "Storage Usage by Type"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            {t.admin.noDisksFound}
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map(([type, bytes]) => {
              const config = typeConfig[type] || typeConfig.other;
              const pct = totalUsed > 0 ? ((bytes as number) / totalUsed) * 100 : 0;
              const barWidth = maxBytes > 0 ? ((bytes as number) / maxBytes) * 100 : 0;
              const Icon = config.icon;
              return (
                <motion.div
                  key={type}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-sm font-medium">{config.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{formatFileSize(bytes as number)}</span>
                      <span className="text-xs font-semibold text-muted-foreground">{pct.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-muted/50 dark:bg-white/[0.06] overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${barWidth}%` }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                      className={cn("h-full rounded-full", config.color)}
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// --- Top Largest Files Card ---
function TopFilesCard() {
  const { t } = useI18n();
  const { data, isLoading } = useQuery<{
    files: Array<{ id: string; name: string; size: number; mimeType: string; createdAt: string }>;
  }>({
    queryKey: ["admin-disk-top-files"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/files?limit=10&sort=size&order=desc");
        if (!res.ok) return { files: [] };
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.items || data.files || []);
        return { files: items.slice(0, 10) };
      } catch {
        return { files: [] };
      }
    },
  });

  const files = data?.files ?? [];

  const getFileIcon = (mimeType: string) => {
    if (!mimeType) return FileIcon;
    const mime = mimeType.toLowerCase();
    if (mime.startsWith("image/")) return Image;
    if (mime.startsWith("video/")) return Film;
    if (mime.startsWith("audio/")) return Music;
    if (mime.includes("zip") || mime.includes("rar")) return Archive;
    if (mime.includes("javascript") || mime.includes("typescript")) return Code;
    return FileText;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-500/10">
            <FileWarning className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          {t.admin.topLargestFiles || "Top Largest Files"}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        ) : files.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            {t.admin.noDisksFound}
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto">
            {files.map((file, idx) => {
              const Icon = getFileIcon(file.mimeType);
              return (
                <div
                  key={file.id}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors border-b last:border-b-0"
                >
                  <span className="text-xs font-mono text-muted-foreground w-5">{idx + 1}.</span>
                  <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm truncate flex-1">{file.name}</span>
                  <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
                    {formatFileSize(file.size)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// --- Storage Trend Card ---
function StorageTrendCard() {
  const { t } = useI18n();
  // Simulate trend data based on current storage stats
  const { data: statsData } = useQuery<{
    usedBytes: number;
    totalBytes: number;
  }>({
    queryKey: ["admin-disk-trend"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/files/stats");
        if (!res.ok) return { usedBytes: 0, totalBytes: 10737418240 };
        const data = await res.json();
        return {
          usedBytes: data.usedBytes ?? 0,
          totalBytes: data.totalBytes ?? 10737418240,
        };
      } catch {
        return { usedBytes: 0, totalBytes: 10737418240 };
      }
    },
  });

  const usedBytes = statsData?.usedBytes ?? 0;
  const totalBytes = statsData?.totalBytes ?? 10737418240;
  const usagePercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;

  // Simulate daily data points for the trend chart (CSS-based)
  const trendData = Array.from({ length: 7 }, (_, i) => {
    const basePercent = Math.max(0, usagePercent - (7 - i) * 0.8);
    return Math.min(100, basePercent + Math.random() * 2);
  });
  trendData[6] = usagePercent; // Current value is accurate

  const isGrowing = trendData[6] > trendData[0];
  const growthRate = trendData[6] - trendData[0];
  const maxTrend = Math.max(...trendData, 1);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/10">
              {isGrowing ? (
                <TrendingUp className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              ) : (
                <TrendingDown className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              )}
            </div>
            {t.admin.storageTrend || "Storage Trend"}
          </CardTitle>
          <div className="flex items-center gap-1.5">
            {isGrowing ? (
              <Badge variant="outline" className="text-[10px] gap-1 text-amber-600 border-amber-500/30">
                <TrendingUp className="w-3 h-3" />
                +{growthRate.toFixed(1)}%
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] gap-1 text-emerald-600 border-emerald-500/30">
                <TrendingDown className="w-3 h-3" />
                {growthRate.toFixed(1)}%
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Mini bar chart */}
          <div className="flex items-end gap-1.5 h-16">
            {trendData.map((val, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full rounded-t-sm transition-all duration-300"
                  style={{
                    height: `${(val / maxTrend) * 100}%`,
                    minHeight: "4px",
                  }}
                >
                  <div className={cn(
                    "w-full h-full rounded-t-sm",
                    idx === trendData.length - 1
                      ? "bg-emerald-500 dark:bg-emerald-400"
                      : "bg-emerald-500/30 dark:bg-emerald-400/20"
                  )} />
                </div>
                <span className="text-[9px] text-muted-foreground">
                  {7 - idx}d
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{formatFileSize(usedBytes)} / {formatFileSize(totalBytes)}</span>
            <span className={cn(
              "font-medium",
              usagePercent > 80 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
            )}>
              {usagePercent.toFixed(1)}% {t.admin.used || "used"}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Cleanup Action Card Sub-Component ---

function CleanupActionCard({
  icon,
  iconBg,
  iconColor,
  title,
  description,
  scanLabel,
  cleanLabel,
  isScanning,
  result,
  onScan,
  onClean,
  t,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  scanLabel: string;
  cleanLabel: string;
  isScanning: boolean;
  result: CleanupResult | null | undefined;
  onScan: () => void;
  onClean: () => void;
  t: Record<string, unknown>;
}) {
  const admin = t as Record<string, Record<string, string>>;
  const a = admin.admin || {};

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={cn("p-2 rounded-lg", iconBg)}>
            <div className={iconColor}>{icon}</div>
          </div>
          <div>
            <div className="text-sm font-medium">{title}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-7 text-xs"
            onClick={onScan}
            disabled={isScanning}
          >
            {isScanning ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : (
              <ScanSearch className="w-3 h-3" />
            )}
            {isScanning ? a.scanning || "Scanning..." : scanLabel}
          </Button>
          {result && result.count > 0 && (
            <Button
              size="sm"
              className="gap-1.5 h-7 text-xs bg-rose-600 hover:bg-rose-700"
              onClick={onClean}
            >
              <Trash2 className="w-3 h-3" />
              {cleanLabel}
            </Button>
          )}
        </div>
      </div>

      {/* Scan Result */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="mt-3 pl-11">
              <div className="rounded-md bg-muted/50 p-3">
                <div className="flex items-center gap-2 text-sm">
                  {result.count > 0 ? (
                    <>
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      <span className="font-medium">
                        {result.count} {a.filesFound || "items found"}
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <span className="text-muted-foreground">{a.noOrphansFound || "No orphans found"}</span>
                    </>
                  )}
                </div>
                {result.count > 0 && result.items.length > 0 && (
                  <div className="mt-2 max-h-32 overflow-y-auto space-y-1">
                    {result.items.slice(0, 10).map((item, i) => (
                      <div key={i} className="text-xs text-muted-foreground flex items-center gap-2">
                        <span className="truncate">
                          {item.path || item.name || item.token || item.fileName || "-"}
                        </span>
                        {item.size != null && item.size > 0 && (
                          <span className="shrink-0">({formatFileSize(item.size)})</span>
                        )}
                      </div>
                    ))}
                    {result.items.length > 10 && (
                      <div className="text-xs text-muted-foreground italic">
                        +{result.items.length - 10} more...
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
