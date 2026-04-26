"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HardDrive, ArrowRight, Copy, Move, CheckCircle2, XCircle, Loader2, FolderOpen, ChevronRight, File, Folder, AlertTriangle, Server, Cloud, Globe, Network } from "lucide-react";
import { useFileStore } from "@/store/file-store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import { formatFileSize } from "@/lib/file-utils";

const driverIconComponents: Record<string, typeof Server> = {
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

function getDriverIcon(type: string, size: string = "w-5 h-5") {
  const Icon = driverIconComponents[type] || HardDrive;
  return <Icon className={size} />;
}

interface DriverInfo {
  id: string;
  name: string;
  type: string;
  isDefault: boolean;
  status: string;
  totalStorage: number;
  usedStorage: number;
  mountPath?: string;
  isReadOnly?: boolean;
}

interface FolderItem {
  id: string;
  name: string;
  parentId: string | null;
  childrenCount: number;
}

interface TransferStatus {
  taskId: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "cancelled";
  progress: number;
  totalFiles: number;
  processedFiles: number;
  succeededFiles: number;
  failedFiles: number;
  totalBytes: number;
  transferredBytes: number;
  errors: string[];
  duration: number;
  mode: "copy" | "move";
  sourceDriverId: string;
  targetDriverId: string;
}

export function CrossDriverMoveDialog() {
  const { crossDriverMoveOpen, setCrossDriverMoveOpen, crossDriverMoveFileIds } = useFileStore();
  const queryClient = useQueryClient();
  const { t } = useI18n();

  const [selectedDriverId, setSelectedDriverId] = useState<string>("");
  const [mode, setMode] = useState<"copy" | "move">("move");
  const [targetParentId, setTargetParentId] = useState<string>("root");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [transferStatus, setTransferStatus] = useState<TransferStatus | null>(null);
  const [showFolderBrowser, setShowFolderBrowser] = useState(false);
  const [browsingFolderId, setBrowsingFolderId] = useState<string>("root");
  const [folderBreadcrumb, setFolderBreadcrumb] = useState<{ id: string; name: string }[]>([
    { id: "root", name: "Root" },
  ]);

  // Fetch available drivers
  const { data: driversData } = useQuery<{ drivers: DriverInfo[] }>({
    queryKey: ["cross-driver-list"],
    queryFn: async () => {
      const res = await fetch("/api/files/cross-driver-transfer");
      if (!res.ok) throw new Error("Failed to fetch drivers");
      return res.json();
    },
    enabled: crossDriverMoveOpen,
  });

  const drivers = driversData?.drivers || [];

  // Fetch file info for selected files
  const { data: filesInfo } = useQuery({
    queryKey: ["cross-driver-files-info", crossDriverMoveFileIds],
    queryFn: async () => {
      if (crossDriverMoveFileIds.length === 0) return [];
      const res = await fetch(`/api/files/cross-driver-transfer/info?fileIds=${crossDriverMoveFileIds.join(",")}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: crossDriverMoveOpen && crossDriverMoveFileIds.length > 0,
  });

  // Fetch folders in the browsing directory for the target driver
  // Use VFS API for non-local drivers, regular API for local
  const { data: foldersData } = useQuery<FolderItem[]>({
    queryKey: ["cross-driver-folders", selectedDriverId, browsingFolderId],
    queryFn: async () => {
      // For non-local drivers, try VFS first
      if (selectedDriverId && selectedDriverId !== "local-default") {
        const driverInfo = drivers.find(d => d.id === selectedDriverId);
        const mountPath = driverInfo?.mountPath || `/${selectedDriverId}`;
        // If browsing root, list mount point
        if (browsingFolderId === "root") {
          const vfsRes = await fetch(`/api/vfs?action=list&path=${encodeURIComponent(mountPath)}`);
          if (vfsRes.ok) {
            const vfsData = await vfsRes.json();
            return (vfsData.items || [])
              .filter((item: any) => item.isDir)
              .map((item: any) => ({
                id: item.id || item.name,
                name: item.name,
                parentId: mountPath,
                childrenCount: 0,
              }));
          }
        }
        // Try to list VFS sub-paths for deeper browsing
        const vfsPath = browsingFolderId !== "root" && browsingFolderId !== mountPath
          ? `${mountPath}/${browsingFolderId}`
          : mountPath;
        const vfsRes = await fetch(`/api/vfs?action=list&path=${encodeURIComponent(vfsPath)}`);
        if (vfsRes.ok) {
          const vfsData = await vfsRes.json();
          return (vfsData.items || [])
            .filter((item: any) => item.isDir)
            .map((item: any) => ({
              id: item.id || item.name,
              name: item.name,
              parentId: vfsPath,
              childrenCount: 0,
            }));
        }
      }

      // Fallback to regular files API
      const params = new URLSearchParams();
      params.set("parentId", browsingFolderId);
      params.set("trashed", "false");
      const res = await fetch(`/api/files?${params}`);
      if (!res.ok) throw new Error("Failed to fetch folders");
      const allFiles = await res.json();
      return allFiles.filter((f: FolderItem & { type: string }) => f.type === "folder");
    },
    enabled: showFolderBrowser && !!selectedDriverId,
  });

  // Calculate total size of files to transfer
  const totalTransferSize = useMemo(() => {
    if (filesInfo && Array.isArray(filesInfo)) {
      return filesInfo.reduce((sum: number, f: { size?: number }) => sum + (f.size || 0), 0);
    }
    return 0;
  }, [filesInfo]);

  // Get source driver info from files
  const sourceDriverId = useMemo(() => {
    if (filesInfo && Array.isArray(filesInfo) && filesInfo.length > 0) {
      const firstFile = filesInfo[0] as { driverId?: string };
      return firstFile?.driverId || "local-default";
    }
    return "local-default";
  }, [filesInfo]);

  // Poll transfer status
  useEffect(() => {
    if (!taskId || !crossDriverMoveOpen) return;

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/files/cross-driver-transfer/${taskId}`);
        if (res.ok) {
          const status: TransferStatus = await res.json();
          setTransferStatus(status);

          if (status.status === "completed" || status.status === "failed" || status.status === "cancelled") {
            clearInterval(pollInterval);
            queryClient.invalidateQueries({ queryKey: ["files"] });
            queryClient.invalidateQueries({ queryKey: ["storage-stats"] });

            if (status.status === "completed" && status.failedFiles === 0) {
              toast.success(t.app.transferComplete);
            } else if (status.status === "completed" && status.failedFiles > 0) {
              toast.warning(`${t.app.transferComplete} (${status.failedFiles} ${t.app.filesFailed})`);
            } else {
              toast.error(t.app.transferFailed);
            }
          }
        }
      } catch {
        // Polling error, continue
      }
    }, 1000);

    return () => clearInterval(pollInterval);
  }, [taskId, crossDriverMoveOpen, queryClient, t]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!crossDriverMoveOpen) {
      const timer = setTimeout(() => {
        setSelectedDriverId("");
        setMode("move");
        setTargetParentId("root");
        setTaskId(null);
        setTransferStatus(null);
        setShowFolderBrowser(false);
        setBrowsingFolderId("root");
        setFolderBreadcrumb([{ id: "root", name: "Root" }]);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [crossDriverMoveOpen]);

  const isTransferring = transferStatus?.status === "pending" || transferStatus?.status === "in_progress";
  const isComplete = transferStatus?.status === "completed" || transferStatus?.status === "failed" || transferStatus?.status === "cancelled";

  const handleStartTransfer = useCallback(async () => {
    if (!selectedDriverId) {
      toast.error(t.app.selectDriver);
      return;
    }

    try {
      const res = await fetch("/api/files/cross-driver-transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileIds: crossDriverMoveFileIds,
          targetDriverId: selectedDriverId,
          targetParentId,
          mode,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setTaskId(data.taskId);
        setTransferStatus({
          taskId: data.taskId,
          status: "pending",
          progress: 0,
          totalFiles: data.totalFiles || 0,
          processedFiles: 0,
          succeededFiles: 0,
          failedFiles: 0,
          totalBytes: data.totalBytes || 0,
          transferredBytes: 0,
          errors: [],
          duration: 0,
          mode,
          sourceDriverId: data.sourceDriverId || sourceDriverId,
          targetDriverId: data.targetDriverId || selectedDriverId,
        });
      } else {
        const error = await res.json().catch(() => ({ error: "Transfer failed" }));
        toast.error(error.error || t.app.transferFailed);
      }
    } catch {
      toast.error(t.app.transferFailed);
    }
  }, [selectedDriverId, crossDriverMoveFileIds, targetParentId, mode, t, sourceDriverId]);

  const handleClose = useCallback(() => {
    if (isTransferring) return;
    setCrossDriverMoveOpen(false);
  }, [isTransferring, setCrossDriverMoveOpen]);

  const handleFolderBrowse = useCallback((folderId: string, folderName: string) => {
    setBrowsingFolderId(folderId);
    setTargetParentId(folderId);
    setFolderBreadcrumb((prev) => [...prev, { id: folderId, name: folderName }]);
  }, []);

  const handleBreadcrumbClick = useCallback((index: number) => {
    const newBreadcrumb = folderBreadcrumb.slice(0, index + 1);
    setFolderBreadcrumb(newBreadcrumb);
    const targetFolder = newBreadcrumb[newBreadcrumb.length - 1];
    setBrowsingFolderId(targetFolder.id);
    setTargetParentId(targetFolder.id);
  }, [folderBreadcrumb]);

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatSpeed = (bytesPerSecond: number): string => {
    if (bytesPerSecond <= 0) return "0 B/s";
    if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`;
    if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
    if (bytesPerSecond < 1024 * 1024 * 1024) return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
    return `${(bytesPerSecond / (1024 * 1024 * 1024)).toFixed(1)} GB/s`;
  };

  // Filter drivers to exclude source driver
  const filteredDrivers = drivers.filter((d) => {
    const sourceNorm = sourceDriverId === "local-default" || !sourceDriverId ? "local-default" : sourceDriverId;
    const driverNorm = d.id === "local-default" || d.id === "default-local" ? "local-default" : d.id;
    return driverNorm !== sourceNorm || drivers.length <= 1;
  });

  // Find selected driver info
  const selectedDriver = drivers.find((d) => d.id === selectedDriverId);

  return (
    <Dialog open={crossDriverMoveOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-emerald-600" />
            {t.app.crossDriverTransfer}
          </DialogTitle>
          <DialogDescription>
            {crossDriverMoveFileIds.length} {crossDriverMoveFileIds.length === 1 ? "item" : "items"} selected
            {totalTransferSize > 0 && (
              <span className="ml-1 text-muted-foreground">
                · {formatFileSize(totalTransferSize)}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-5 py-4">
            {/* Transfer progress section */}
            {(isTransferring || isComplete) && transferStatus && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{t.app.transferProgress}</span>
                  <span className={cn(
                    "font-medium",
                    isComplete && transferStatus.status === "completed" && transferStatus.failedFiles === 0 && "text-emerald-600",
                    isComplete && (transferStatus.status === "failed" || transferStatus.failedFiles > 0) && "text-amber-600",
                    isTransferring && "text-emerald-600"
                  )}>
                    {isTransferring && (
                      <span className="flex items-center gap-1">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        {t.app.transferring} {transferStatus.progress}%
                      </span>
                    )}
                    {isComplete && transferStatus.status === "completed" && transferStatus.failedFiles === 0 && (
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {t.app.transferComplete}
                      </span>
                    )}
                    {isComplete && transferStatus.status === "completed" && transferStatus.failedFiles > 0 && (
                      <span className="flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Completed with errors
                      </span>
                    )}
                    {isComplete && transferStatus.status === "failed" && (
                      <span className="flex items-center gap-1">
                        <XCircle className="w-3.5 h-3.5" />
                        {t.app.transferFailed}
                      </span>
                    )}
                  </span>
                </div>

                <Progress value={transferStatus.progress} className="h-2" />

                {/* Transfer speed and file progress */}
                {isTransferring && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{transferStatus.duration > 0 ? formatSpeed(transferStatus.transferredBytes / (transferStatus.duration / 1000)) : "Calculating..."}</span>
                    <span>{transferStatus.processedFiles} / {transferStatus.totalFiles} files</span>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-muted/50 rounded-md p-2">
                    <div className="font-semibold text-sm">{transferStatus.totalFiles}</div>
                    <div className="text-muted-foreground">Total</div>
                  </div>
                  <div className="bg-emerald-500/10 rounded-md p-2">
                    <div className="font-semibold text-sm text-emerald-600">{transferStatus.succeededFiles}</div>
                    <div className="text-emerald-600/70">{t.app.filesSucceeded}</div>
                  </div>
                  <div className="bg-red-500/10 rounded-md p-2">
                    <div className="font-semibold text-sm text-red-600">{transferStatus.failedFiles}</div>
                    <div className="text-red-600/70">{t.app.filesFailed}</div>
                  </div>
                </div>

                {transferStatus.totalBytes > 0 && (
                  <div className="text-xs text-muted-foreground text-center">
                    {formatFileSize(transferStatus.transferredBytes)} / {formatFileSize(transferStatus.totalBytes)}
                    {transferStatus.duration > 0 && ` · ${formatDuration(transferStatus.duration)}`}
                  </div>
                )}

                {transferStatus.errors.length > 0 && (
                  <ScrollArea className="max-h-24">
                    <div className="text-xs text-red-500 space-y-0.5">
                      {transferStatus.errors.slice(0, 10).map((error, i) => (
                        <p key={i}>• {error}</p>
                      ))}
                      {transferStatus.errors.length > 10 && (
                        <p className="text-muted-foreground">...and {transferStatus.errors.length - 10} more errors</p>
                      )}
                    </div>
                  </ScrollArea>
                )}
              </div>
            )}

            {/* Configuration section (hidden during/after transfer) */}
            {!isTransferring && !isComplete && (
              <>
                {/* Source info */}
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border/50">
                  <div className="shrink-0">{getDriverIcon(sourceDriverId === "local-default" || !sourceDriverId ? "local" : drivers.find(d => d.id === sourceDriverId)?.type || "local", "w-5 h-5")}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground">Source</div>
                    <div className="text-sm font-medium truncate">
                      {sourceDriverId === "local-default" || !sourceDriverId
                        ? "Local Storage (Default)"
                        : drivers.find(d => d.id === sourceDriverId)?.name || sourceDriverId}
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </div>

                {/* Target driver selection */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t.app.selectTargetDriver}</Label>
                  {filteredDrivers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t.app.noDriversAvailable}</p>
                  ) : (
                    <RadioGroup value={selectedDriverId} onValueChange={(val) => { setSelectedDriverId(val); setShowFolderBrowser(false); }}>
                      <div className="space-y-2 max-h-56 overflow-y-auto">
                        {filteredDrivers.map((driver) => {
                          const usagePercent = driver.totalStorage > 0 ? Math.round((driver.usedStorage / driver.totalStorage) * 100) : 0;
                          const mountPath = driver.mountPath || `/${driver.type}-${driver.id.substring(0, 8)}`;
                          return (
                            <label
                              key={driver.id}
                              htmlFor={`driver-${driver.id}`}
                              className={cn(
                                "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                                selectedDriverId === driver.id
                                  ? "border-emerald-500 bg-emerald-500/5"
                                  : "border-border hover:border-emerald-500/30 hover:bg-muted/30"
                              )}
                            >
                              <RadioGroupItem value={driver.id} id={`driver-${driver.id}`} />
                              <div className="shrink-0">{getDriverIcon(driver.type, "w-4 h-4")}</div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm truncate">{driver.name}</span>
                                  {driver.isDefault && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-medium">
                                      Default
                                    </span>
                                  )}
                                  <span className="text-xs text-muted-foreground ml-1">
                                    ({mountPath})
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-xs text-muted-foreground capitalize">{driver.type}</span>
                                  {driver.isReadOnly && (
                                    <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600">
                                      Read-only
                                    </span>
                                  )}
                                  {driver.totalStorage > 0 && (
                                    <span className="text-xs text-muted-foreground">
                                      · {formatFileSize(driver.usedStorage)} / {formatFileSize(driver.totalStorage)}
                                    </span>
                                  )}
                                </div>
                                {driver.totalStorage > 0 && (
                                  <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className={cn(
                                        "h-full rounded-full transition-all",
                                        usagePercent > 90 ? "bg-red-500" : usagePercent > 70 ? "bg-amber-500" : "bg-emerald-500"
                                      )}
                                      style={{ width: `${Math.min(usagePercent, 100)}%` }}
                                    />
                                  </div>
                                )}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </RadioGroup>
                  )}
                </div>

                {/* Transfer mode */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t.app.transferMode}</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setMode("move")}
                      className={cn(
                        "flex items-center justify-center gap-2 p-3 rounded-lg border transition-all",
                        mode === "move"
                          ? "border-emerald-500 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                          : "border-border hover:border-emerald-500/30"
                      )}
                    >
                      <Move className="w-4 h-4" />
                      <div className="text-left">
                        <div className="text-sm font-medium">{t.app.moveToDriver}</div>
                        <div className="text-[10px] text-muted-foreground">Remove from source</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("copy")}
                      className={cn(
                        "flex items-center justify-center gap-2 p-3 rounded-lg border transition-all",
                        mode === "copy"
                          ? "border-emerald-500 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                          : "border-border hover:border-emerald-500/30"
                      )}
                    >
                      <Copy className="w-4 h-4" />
                      <div className="text-left">
                        <div className="text-sm font-medium">{t.app.copyToDriver}</div>
                        <div className="text-[10px] text-muted-foreground">Keep in source</div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Target folder selection */}
                {selectedDriverId && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">{t.app.targetFolder}</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          setShowFolderBrowser(!showFolderBrowser);
                          if (!showFolderBrowser) {
                            setBrowsingFolderId("root");
                            setTargetParentId("root");
                            setFolderBreadcrumb([{ id: "root", name: "Root" }]);
                          }
                        }}
                      >
                        {showFolderBrowser ? "Hide" : "Browse"}
                      </Button>
                    </div>

                    {!showFolderBrowser ? (
                      <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-muted/20">
                        <HardDrive className="w-4 h-4 text-muted-foreground" />
                        <ArrowRight className="w-3 h-3 text-muted-foreground" />
                        <FolderOpen className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">{targetParentId === "root" ? t.app.rootFolder : "Selected folder"}</span>
                      </div>
                    ) : (
                      <div className="border border-border rounded-lg overflow-hidden">
                        {/* Breadcrumb */}
                        <div className="flex items-center gap-1 px-3 py-2 bg-muted/30 border-b border-border/50 text-xs overflow-x-auto">
                          {folderBreadcrumb.map((item, index) => (
                            <span key={item.id} className="flex items-center gap-1 shrink-0">
                              {index > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                              <button
                                type="button"
                                className={cn(
                                  "hover:text-emerald-600 transition-colors",
                                  index === folderBreadcrumb.length - 1 ? "font-medium text-foreground" : "text-muted-foreground"
                                )}
                                onClick={() => handleBreadcrumbClick(index)}
                              >
                                {item.name}
                              </button>
                            </span>
                          ))}
                        </div>

                        {/* Select current folder button */}
                        <button
                          type="button"
                          className={cn(
                            "w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors",
                            targetParentId === browsingFolderId
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                              : "hover:bg-muted/50"
                          )}
                          onClick={() => setTargetParentId(browsingFolderId)}
                        >
                          <FolderOpen className="w-4 h-4 shrink-0" />
                          <span className="flex-1 text-left">
                            {browsingFolderId === "root" ? t.app.rootFolder : "This folder"}
                          </span>
                          {targetParentId === browsingFolderId && (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                          )}
                        </button>

                        {/* Folder list */}
                        <ScrollArea className="max-h-40">
                          {foldersData && foldersData.length > 0 ? (
                            <div className="divide-y divide-border/30">
                              {foldersData.map((folder) => (
                                <button
                                  key={folder.id}
                                  type="button"
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                                  onClick={() => handleFolderBrowse(folder.id, folder.name)}
                                >
                                  <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                                  <span className="flex-1 text-left truncate">{folder.name}</span>
                                  <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                              No subfolders
                            </div>
                          )}
                        </ScrollArea>
                      </div>
                    )}
                  </div>
                )}

                {/* Transfer summary */}
                {selectedDriverId && totalTransferSize > 0 && selectedDriver && (
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                    <div className="text-xs font-medium text-muted-foreground mb-1.5">Transfer Summary</div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Mode</span>
                        <span className="font-medium capitalize">{mode}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Size</span>
                        <span className="font-medium">{formatFileSize(totalTransferSize)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Items</span>
                        <span className="font-medium">{crossDriverMoveFileIds.length}</span>
                      </div>
                      {selectedDriver.totalStorage > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Available on target</span>
                          <span className={cn(
                            "font-medium",
                            selectedDriver.totalStorage - selectedDriver.usedStorage < totalTransferSize
                              ? "text-red-500"
                              : "text-emerald-600"
                          )}>
                            {formatFileSize(selectedDriver.totalStorage - selectedDriver.usedStorage)}
                          </span>
                        </div>
                      )}
                    </div>
                    {selectedDriver.totalStorage > 0 && selectedDriver.totalStorage - selectedDriver.usedStorage < totalTransferSize && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-red-500">
                        <AlertTriangle className="w-3 h-3" />
                        Not enough space on target drive
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="border-t pt-4">
          {!isTransferring && !isComplete && (
            <>
              <Button variant="outline" onClick={handleClose}>
                {t.app.cancelTransfer}
              </Button>
              <Button
                onClick={handleStartTransfer}
                disabled={!selectedDriverId || crossDriverMoveFileIds.length === 0}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {mode === "move" ? (
                  <span className="flex items-center gap-1.5">
                    <Move className="w-4 h-4" />
                    {t.app.startTransfer}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <Copy className="w-4 h-4" />
                    {t.app.startTransfer}
                  </span>
                )}
              </Button>
            </>
          )}
          {isComplete && (
            <Button onClick={handleClose} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {t.app.close}
            </Button>
          )}
          {isTransferring && (
            <Button variant="outline" disabled>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              {t.app.transferring}...
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
