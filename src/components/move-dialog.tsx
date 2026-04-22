"use client";

import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { FolderInput, Folder, ChevronRight, ChevronDown } from "lucide-react";
import type { FileItem } from "@/lib/file-utils";
import { cn } from "@/lib/utils";
import { showUndoToast, invalidateAfterUndo } from "@/lib/undo-toast";
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

export function MoveDialog() {
  const { moveFile, setMoveFile, addActivity } = useFileStore();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { data: rootFolders = [] } = useQuery<FileItem[]>({
    queryKey: ["files", "root", "folders"],
    queryFn: async () => {
      const res = await fetch(`/api/files?parentId=root&trashed=false`);
      if (!res.ok) return [];
      const all = await res.json();
      return all.filter((f: FileItem) => f.type === "folder");
    },
    enabled: !!moveFile,
  });

  const handleMove = async () => {
    if (!moveFile || !selectedId) return;
    const originalParentId = moveFile.parentId;
    setLoading(true);
    try {
      const res = await fetch("/api/files/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: moveFile.id, targetParentId: selectedId }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["files"] });
        addActivity({ action: "move", fileName: moveFile.name });
        setMoveFile(null);
        showUndoToast(
          `Moved "${moveFile.name}"`,
          async () => {
            const undoRes = await fetch("/api/files/move", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: moveFile.id, targetParentId: originalParentId }),
            });
            if (undoRes.ok) invalidateAfterUndo(queryClient);
          },
          { onSuccess: `Moved "${moveFile.name}" back` },
        );
      }
    } catch {
      // Error handled silently
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setMoveFile(null);
      setSelectedId(null);
    }
  };

  return (
    <Dialog open={!!moveFile} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderInput className="w-5 h-5 text-emerald-600" />
            Move Item
          </DialogTitle>
          <DialogDescription>
            {t.app.moveDesc} &quot;{moveFile?.name}&quot;
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-72 border rounded-lg p-2">
          {/* Root option */}
          <button
            className={cn(
              "flex items-center gap-1.5 w-full py-1.5 px-2 rounded-md text-sm hover:bg-accent transition-colors",
              selectedId === "root" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            )}
            onClick={() => setSelectedId("root")}
          >
            <Folder className="w-4 h-4 text-amber-500" />
            <span>Root (My Drive)</span>
          </button>
          {rootFolders
            .filter((f) => f.id !== moveFile?.id)
            .map((folder) => (
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
            Cancel
          </Button>
          <Button
            onClick={handleMove}
            disabled={!selectedId || loading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {loading ? t.app.moving : t.app.moveHere}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
