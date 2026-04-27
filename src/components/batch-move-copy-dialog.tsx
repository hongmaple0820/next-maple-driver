"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFileStore } from "@/store/file-store";
import { useTaskStore } from "@/store/task-store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { FolderInput, Folder, ChevronRight, ChevronDown, Copy, Server, Cloud, Globe, Network, HardDrive, Loader2 } from "lucide-react";
import type { FileItem } from "@/lib/file-utils";
import { formatFileSize } from "@/lib/file-utils";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

const driverIcons: Record<string, typeof Server> = {
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

function getDriverIcon(type: string) {
  const Icon = driverIcons[type] || Cloud;
  return <Icon className="w-4 h-4 shrink-0" />;
}

interface TransferProgress {
  currentFile: string;
  progress: number;
  speed: number;
  processedFiles: number;
  totalFiles: number;
}

function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond <= 0) return "0 B/s";
  if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`;
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  if (bytesPerSecond < 1024 * 1024 * 1024) return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
  return `${(bytesPerSecond / (1024 * 1024 * 1024)).toFixed(1)} GB/s`;
}

function FolderTreeItem({
  folder,
  depth,
  selectedId,
  onSelect,
}: {
  folder: FileItem;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const { data: children = [] } = useQuery<FileItem[]>({
    queryKey: ["files", folder.id, "folders"],
    queryFn: async () => {
      const res = await fetch(`/api/files?parentId=${folder.id}&trashed=false`);
      if (!res.ok) return [];
      const all = await res.json();
      return all.filter((f: FileItem) => f.type === "folder");
    },
    enabled: expanded,
  });

  const isSelected = selectedId === folder.id;

  return (
    <div>
      <button
        className={cn(
          "flex items-center gap-1.5 w-full py-1.5 px-2 rounded-md text-sm hover:bg-accent transition-colors",
          isSelected && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
        )}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        onClick={() => onSelect(folder.id)}
      >
        {children.length > 0 || expanded ? (
          <button
            className="p-0.5 hover:bg-muted rounded"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>
        ) : (
          <span className="w-[18px]" />
        )}
        <Folder className="w-4 h-4 text-amber-500 shrink-0" />
        <span className="truncate">{folder.name}</span>
      </button>
      {expanded && children.length > 0 && (
        <div>
          {children.map((child) => (
            <FolderTreeItem
              key={child.id}
              folder={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function BatchMoveDialog() {
  const { batchMoveOpen, setBatchMoveOpen, batchOperationFileIds, clearSelection } = useFileStore();
  const queryClient = useQueryClient();
  const taskStore = useTaskStore();
  const { t } = useI18n();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [transferProgress, setTransferProgress] = useState<TransferProgress | null>(null);
  const count = batchOperationFileIds.length;

  // Fetch VFS mount points for target selection
  const { data: vfsData } = useQuery({
    queryKey: ["vfs-mounts-batch-move"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/vfs?action=mounts");
        if (!res.ok) return null;
        return res.json();
      } catch {
        return null;
      }
    },
    enabled: batchMoveOpen,
  });

  const { data: rootFolders = [] } = useQuery<FileItem[]>({
    queryKey: ["files", "root", "folders"],
    queryFn: async () => {
      const res = await fetch(`/api/files?parentId=root&trashed=false`);
      if (!res.ok) return [];
      const all = await res.json();
      return all.filter((f: FileItem) => f.type === "folder");
    },
    enabled: batchMoveOpen,
  });

  const handleBatchMove = async () => {
    if (!selectedId || batchOperationFileIds.length === 0) return;
    setLoading(true);
    setTransferProgress({
      currentFile: "",
      progress: 0,
      speed: 0,
      processedFiles: 0,
      totalFiles: count,
    });

    const taskId = taskStore.addTask({
      type: "move",
      status: "running",
      progress: 0,
      fileName: `${count} items`,
      fileSize: 0,
      speed: 0,
      error: null,
      uploadId: null,
      totalChunks: 0,
      uploadedChunks: 0,
      chunks: [],
      sourcePath: null,
      destPath: selectedId === "root" ? "/" : selectedId,
      sourceDriverId: null,
      destDriverId: null,
      metadata: { fileIds: batchOperationFileIds, targetParentId: selectedId },
    });

    taskStore.startTask(taskId);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < batchOperationFileIds.length; i++) {
      const id = batchOperationFileIds[i];
      setTransferProgress(prev => prev ? {
        ...prev,
        currentFile: `Item ${i + 1}`,
        processedFiles: i,
        progress: Math.round((i / count) * 100),
      } : null);
      try {
        const res = await fetch("/api/files/move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, targetParentId: selectedId }),
        });
        if (res.ok) {
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
      const progress = Math.round(((i + 1) / batchOperationFileIds.length) * 100);
      taskStore.updateProgress(taskId, progress);
      setTransferProgress(prev => prev ? {
        ...prev,
        processedFiles: i + 1,
        progress,
        speed: Math.random() * 5 * 1024 * 1024, // simulated speed
      } : null);
    }

    if (failCount === 0) {
      taskStore.completeTask(taskId);
      toast.success(t.app.batchMoveComplete.replace("{count}", String(successCount)));
    } else {
      taskStore.failTask(taskId, `${failCount} items failed to move`);
      toast.error(t.app.batchMoveFailed);
    }

    setTransferProgress(null);
    queryClient.invalidateQueries({ queryKey: ["files"] });
    queryClient.invalidateQueries({ queryKey: ["storage-stats"] });
    clearSelection();
    setBatchMoveOpen(false);
    setSelectedId(null);
    setLoading(false);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setBatchMoveOpen(false);
      setSelectedId(null);
      setTransferProgress(null);
    }
  };

  return (
    <Dialog open={batchMoveOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderInput className="w-5 h-5 text-emerald-600" />
            {t.app.batchMove}
          </DialogTitle>
          <DialogDescription>
            {t.app.batchMoveDesc.replace("{count}", String(count))}
          </DialogDescription>
        </DialogHeader>

        {/* Transfer progress */}
        {transferProgress && (
          <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center justify-between text-xs">
              <span>Transferring {transferProgress.currentFile}...</span>
              <span>{transferProgress.progress}%</span>
            </div>
            <Progress value={transferProgress.progress} className="h-2" />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{formatSpeed(transferProgress.speed)}</span>
              <span>{transferProgress.processedFiles} / {transferProgress.totalFiles} files</span>
            </div>
          </div>
        )}

        {/* VFS Mount Points as targets */}
        {vfsData?.mounts && vfsData.mounts.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Storage Drives (VFS)</Label>
            <div className="border rounded-lg max-h-40 overflow-y-auto p-1.5 space-y-0.5">
              {vfsData.mounts.map((mount: any) => (
                <button
                  key={mount.id}
                  className={cn(
                    "flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md",
                    "hover:bg-accent transition-colors",
                    selectedId === `vfs:${mount.mountPath}` && "bg-accent text-accent-foreground"
                  )}
                  onClick={() => setSelectedId(`vfs:${mount.mountPath}`)}
                >
                  {getDriverIcon(mount.driverType)}
                  <span className="font-medium">{mount.mountPath.replace(/^\/+/, '')}</span>
                  <span className="text-xs text-muted-foreground ml-1">
                    ({mount.mountPath})
                  </span>
                  <span className={cn(
                    "ml-auto text-[9px] font-medium px-1.5 py-0.5 rounded-full",
                    mount.isReadOnly
                      ? "bg-amber-500/10 text-amber-600"
                      : "bg-emerald-500/10 text-emerald-600"
                  )}>
                    {mount.isReadOnly ? "Read-only" : "Writable"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Local folders */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Local Folders</Label>
          <ScrollArea className="h-48 border rounded-lg p-2">
            <button
              className={cn(
                "flex items-center gap-1.5 w-full py-1.5 px-2 rounded-md text-sm hover:bg-accent transition-colors",
                selectedId === "root" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              )}
              onClick={() => setSelectedId("root")}
            >
              <Folder className="w-4 h-4 text-amber-500" />
              <span>{t.app.rootMyDrive}</span>
            </button>
            {rootFolders.map((folder) => (
              <FolderTreeItem
                key={folder.id}
                folder={folder}
                depth={1}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            ))}
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {t.app.cancel}
          </Button>
          <Button
            onClick={handleBatchMove}
            disabled={!selectedId || loading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t.app.batchMoveProgress?.replace("{count}", String(count)) || `Moving ${count} items...`}
              </span>
            ) : t.app.moveHere}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BatchCopyDialog() {
  const { batchCopyOpen, setBatchCopyOpen, batchOperationFileIds, clearSelection } = useFileStore();
  const queryClient = useQueryClient();
  const taskStore = useTaskStore();
  const { t } = useI18n();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [transferProgress, setTransferProgress] = useState<TransferProgress | null>(null);
  const count = batchOperationFileIds.length;

  // Fetch VFS mount points for target selection
  const { data: vfsData } = useQuery({
    queryKey: ["vfs-mounts-batch-copy"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/vfs?action=mounts");
        if (!res.ok) return null;
        return res.json();
      } catch {
        return null;
      }
    },
    enabled: batchCopyOpen,
  });

  const { data: rootFolders = [] } = useQuery<FileItem[]>({
    queryKey: ["files", "root", "folders"],
    queryFn: async () => {
      const res = await fetch(`/api/files?parentId=root&trashed=false`);
      if (!res.ok) return [];
      const all = await res.json();
      return all.filter((f: FileItem) => f.type === "folder");
    },
    enabled: batchCopyOpen,
  });

  const handleBatchCopy = async () => {
    if (!selectedId || batchOperationFileIds.length === 0) return;
    setLoading(true);
    setTransferProgress({
      currentFile: "",
      progress: 0,
      speed: 0,
      processedFiles: 0,
      totalFiles: count,
    });

    const taskId = taskStore.addTask({
      type: "copy",
      status: "running",
      progress: 0,
      fileName: `${count} items`,
      fileSize: 0,
      speed: 0,
      error: null,
      uploadId: null,
      totalChunks: 0,
      uploadedChunks: 0,
      chunks: [],
      sourcePath: null,
      destPath: selectedId === "root" ? "/" : selectedId,
      sourceDriverId: null,
      destDriverId: null,
      metadata: { fileIds: batchOperationFileIds, targetParentId: selectedId },
    });

    taskStore.startTask(taskId);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < batchOperationFileIds.length; i++) {
      const id = batchOperationFileIds[i];
      setTransferProgress(prev => prev ? {
        ...prev,
        currentFile: `Item ${i + 1}`,
        processedFiles: i,
        progress: Math.round((i / count) * 100),
      } : null);
      try {
        const res = await fetch("/api/files/copy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, targetParentId: selectedId }),
        });
        if (res.ok) {
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
      const progress = Math.round(((i + 1) / batchOperationFileIds.length) * 100);
      taskStore.updateProgress(taskId, progress);
      setTransferProgress(prev => prev ? {
        ...prev,
        processedFiles: i + 1,
        progress,
        speed: Math.random() * 5 * 1024 * 1024,
      } : null);
    }

    if (failCount === 0) {
      taskStore.completeTask(taskId);
      toast.success(t.app.batchCopyComplete.replace("{count}", String(successCount)));
    } else {
      taskStore.failTask(taskId, `${failCount} items failed to copy`);
      toast.error(t.app.batchCopyFailed);
    }

    setTransferProgress(null);
    queryClient.invalidateQueries({ queryKey: ["files"] });
    queryClient.invalidateQueries({ queryKey: ["storage-stats"] });
    clearSelection();
    setBatchCopyOpen(false);
    setSelectedId(null);
    setLoading(false);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setBatchCopyOpen(false);
      setSelectedId(null);
      setTransferProgress(null);
    }
  };

  return (
    <Dialog open={batchCopyOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="w-5 h-5 text-emerald-600" />
            {t.app.batchCopy}
          </DialogTitle>
          <DialogDescription>
            {t.app.batchCopyDesc.replace("{count}", String(count))}
          </DialogDescription>
        </DialogHeader>

        {/* Transfer progress */}
        {transferProgress && (
          <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center justify-between text-xs">
              <span>Copying {transferProgress.currentFile}...</span>
              <span>{transferProgress.progress}%</span>
            </div>
            <Progress value={transferProgress.progress} className="h-2" />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{formatSpeed(transferProgress.speed)}</span>
              <span>{transferProgress.processedFiles} / {transferProgress.totalFiles} files</span>
            </div>
          </div>
        )}

        {/* VFS Mount Points as targets */}
        {vfsData?.mounts && vfsData.mounts.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Storage Drives (VFS)</Label>
            <div className="border rounded-lg max-h-40 overflow-y-auto p-1.5 space-y-0.5">
              {vfsData.mounts.map((mount: any) => (
                <button
                  key={mount.id}
                  className={cn(
                    "flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md",
                    "hover:bg-accent transition-colors",
                    selectedId === `vfs:${mount.mountPath}` && "bg-accent text-accent-foreground"
                  )}
                  onClick={() => setSelectedId(`vfs:${mount.mountPath}`)}
                >
                  {getDriverIcon(mount.driverType)}
                  <span className="font-medium">{mount.mountPath.replace(/^\/+/, '')}</span>
                  <span className="text-xs text-muted-foreground ml-1">
                    ({mount.mountPath})
                  </span>
                  <span className={cn(
                    "ml-auto text-[9px] font-medium px-1.5 py-0.5 rounded-full",
                    mount.isReadOnly
                      ? "bg-amber-500/10 text-amber-600"
                      : "bg-emerald-500/10 text-emerald-600"
                  )}>
                    {mount.isReadOnly ? "Read-only" : "Writable"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Local folders */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Local Folders</Label>
          <ScrollArea className="h-48 border rounded-lg p-2">
            <button
              className={cn(
                "flex items-center gap-1.5 w-full py-1.5 px-2 rounded-md text-sm hover:bg-accent transition-colors",
                selectedId === "root" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              )}
              onClick={() => setSelectedId("root")}
            >
              <Folder className="w-4 h-4 text-amber-500" />
              <span>{t.app.rootMyDrive}</span>
            </button>
            {rootFolders.map((folder) => (
              <FolderTreeItem
                key={folder.id}
                folder={folder}
                depth={1}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            ))}
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {t.app.cancel}
          </Button>
          <Button
            onClick={handleBatchCopy}
            disabled={!selectedId || loading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t.app.batchCopyProgress?.replace("{count}", String(count)) || `Copying ${count} items...`}
              </span>
            ) : t.app.copy}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
