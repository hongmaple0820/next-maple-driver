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
import { ScrollArea } from "@/components/ui/scroll-area";
import { FolderInput, Folder, ChevronRight, ChevronDown, Copy } from "lucide-react";
import type { FileItem } from "@/lib/file-utils";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

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
  const count = batchOperationFileIds.length;

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

    // Create a task for tracking
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
    }

    if (failCount === 0) {
      taskStore.completeTask(taskId);
      toast.success(t.app.batchMoveComplete.replace("{count}", String(successCount)));
    } else {
      taskStore.failTask(taskId, `${failCount} items failed to move`);
      toast.error(t.app.batchMoveFailed);
    }

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
        <ScrollArea className="h-72 border rounded-lg p-2">
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
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {t.app.cancel}
          </Button>
          <Button
            onClick={handleBatchMove}
            disabled={!selectedId || loading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {loading ? t.app.batchMoveProgress.replace("{count}", String(count)) : t.app.moveHere}
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
  const count = batchOperationFileIds.length;

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

    // Create a task for tracking
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
    }

    if (failCount === 0) {
      taskStore.completeTask(taskId);
      toast.success(t.app.batchCopyComplete.replace("{count}", String(successCount)));
    } else {
      taskStore.failTask(taskId, `${failCount} items failed to copy`);
      toast.error(t.app.batchCopyFailed);
    }

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
        <ScrollArea className="h-72 border rounded-lg p-2">
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
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {t.app.cancel}
          </Button>
          <Button
            onClick={handleBatchCopy}
            disabled={!selectedId || loading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {loading ? t.app.batchCopyProgress.replace("{count}", String(count)) : t.app.copy}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
