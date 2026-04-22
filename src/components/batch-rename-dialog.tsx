"use client";

import { useState, useMemo, useEffect } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowRight, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import type { FileItem } from "@/lib/file-utils";

// Parse a rename pattern for preview
function parsePattern(
  pattern: string,
  originalName: string,
  index: number,
  createdAt: string
): string {
  const lastDotIndex = originalName.lastIndexOf(".");
  const name = lastDotIndex > 0 ? originalName.substring(0, lastDotIndex) : originalName;
  const ext = lastDotIndex > 0 ? originalName.substring(lastDotIndex + 1) : "";
  const dateStr = new Date(createdAt).toISOString().split("T")[0];

  let result = pattern;

  // Replace {i:0} first (zero-padded number)
  result = result.replace(/\{i:(\d+)\}/g, (_match, padStr: string) => {
    const padLength = parseInt(padStr, 10);
    return String(index).padStart(padLength, "0");
  });

  // Replace {i} with sequential number
  result = result.replace(/\{i\}/g, String(index));

  // Replace {name} with original filename (without extension)
  result = result.replace(/\{name\}/g, name);

  // Replace {ext} with file extension
  result = result.replace(/\{ext\}/g, ext);

  // Replace {date} with creation date
  result = result.replace(/\{date\}/g, dateStr);

  return result;
}

export function BatchRenameDialog() {
  const {
    batchRenameOpen, setBatchRenameOpen, selectedFileIds, clearSelection,
    addActivity, currentFolderId, section, searchQuery,
  } = useFileStore();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [pattern, setPattern] = useState("{name}.{ext}");
  const [startIndex, setStartIndex] = useState(1);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  const selectedIds = useMemo(() => Array.from(selectedFileIds), [selectedFileIds]);

  const isSearch = searchQuery.trim().length > 0;

  // Fetch files from the current view to get file details for preview
  const { data: currentFiles = [] } = useQuery<FileItem[]>({
    queryKey: ["files", currentFolderId, section, searchQuery],
    queryFn: async () => {
      if (isSearch) {
        const res = await fetch(`/api/files/search?q=${encodeURIComponent(searchQuery)}`);
        if (!res.ok) throw new Error("Search failed");
        return res.json();
      }
      if (section === "recent") {
        const res = await fetch("/api/files/recent");
        if (!res.ok) throw new Error("Failed to fetch recent files");
        return res.json();
      }
      const trashed = section === "trash";
      const starred = section === "starred";
      const params = new URLSearchParams();
      if (!starred) {
        params.set("parentId", currentFolderId);
      }
      params.set("trashed", String(trashed));
      if (starred) {
        params.set("starred", "true");
      }
      const res = await fetch(`/api/files?${params}`);
      if (!res.ok) throw new Error("Failed to fetch files");
      return res.json();
    },
    enabled: batchRenameOpen,
  });

  const filesToRename = useMemo(() => {
    return currentFiles.filter((f) => selectedFileIds.has(f.id));
  }, [currentFiles, selectedFileIds]);

  // Compute preview
  const preview = useMemo(() => {
    const results: Array<{ oldName: string; newName: string; changed: boolean }> = [];
    let index = startIndex;
    for (const file of filesToRename) {
      const newName = parsePattern(pattern, file.name, index, file.createdAt);
      results.push({
        oldName: file.name,
        newName,
        changed: newName !== file.name,
      });
      index += step;
    }
    return results;
  }, [filesToRename, pattern, startIndex, step]);

  // Check for duplicates in preview
  const hasDuplicates = useMemo(() => {
    const names = preview.map((p) => p.newName);
    return names.some((name, i) => names.indexOf(name) !== i);
  }, [preview]);

  // Reset form when dialog opens
  useEffect(() => {
    if (batchRenameOpen) {
      setPattern("{name}.{ext}");
      setStartIndex(1);
      setStep(1);
    }
  }, [batchRenameOpen]);

  const handleRename = async () => {
    if (selectedIds.length === 0 || !pattern.trim()) return;
    if (hasDuplicates) {
      toast.error("Duplicate names detected. Please adjust the pattern.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/files/batch-rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileIds: selectedIds,
          pattern: pattern.trim(),
          startIndex,
          step,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: t.app.batchRename + " failed" }));
        toast.error(data.error || "Failed to batch rename files");
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["files"] });
      addActivity({ action: "rename", fileName: `${selectedIds.length} files` });
      toast.success(`Renamed ${selectedIds.length} file${selectedIds.length > 1 ? "s" : ""} successfully`);
      setBatchRenameOpen(false);
      clearSelection();
    } catch {
      toast.error("Failed to batch rename files");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) setBatchRenameOpen(false);
  };

  const PREVIEW_LIMIT = 10;
  const previewItems = preview.slice(0, PREVIEW_LIMIT);
  const remainingCount = preview.length - PREVIEW_LIMIT;

  return (
    <Dialog open={batchRenameOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-5 h-5 text-emerald-600" />
            Batch Rename
            <Badge variant="secondary" className="ml-1">
              {selectedIds.length} {t.app.items}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Rename multiple files at once using a pattern.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Pattern input */}
          <div className="space-y-2">
            <Label htmlFor="batch-pattern">Pattern</Label>
            <Input
              id="batch-pattern"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="e.g. Photo_{i:0}.{ext}"
              autoFocus
              onFocus={(e) => e.target.select()}
            />
            <p className="text-xs text-muted-foreground space-y-0.5">
              <span className="block">
                <code className="bg-muted px-1 py-0.5 rounded text-[11px]">{"{name}"}</code> filename without extension
                {" "}&middot;{" "}
                <code className="bg-muted px-1 py-0.5 rounded text-[11px]">{"{ext}"}</code> extension
              </span>
              <span className="block">
                <code className="bg-muted px-1 py-0.5 rounded text-[11px]">{"{i}"}</code> sequential number
                {" "}&middot;{" "}
                <code className="bg-muted px-1 py-0.5 rounded text-[11px]">{"{i:0}"}</code> zero-padded (01, 02...)
                {" "}&middot;{" "}
                <code className="bg-muted px-1 py-0.5 rounded text-[11px]">{"{date}"}</code> creation date
              </span>
            </p>
          </div>

          {/* Start number and step */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="batch-start">Start Number</Label>
              <Input
                id="batch-start"
                type="number"
                min={0}
                value={startIndex}
                onChange={(e) => setStartIndex(parseInt(e.target.value) || 1)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="batch-step">Step</Label>
              <Input
                id="batch-step"
                type="number"
                min={1}
                value={step}
                onChange={(e) => setStep(parseInt(e.target.value) || 1)}
              />
            </div>
          </div>

          {/* Preview section */}
          {preview.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Preview</Label>
              <ScrollArea className="max-h-64 rounded-md border">
                <div className="divide-y">
                  {previewItems.map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 px-3 py-2 text-sm"
                    >
                      <span className={item.changed ? "text-muted-foreground line-through decoration-muted-foreground/40 truncate min-w-0" : "text-muted-foreground truncate min-w-0"}>
                        {item.oldName}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground/50" />
                      <span className={item.changed ? "text-emerald-600 dark:text-emerald-400 font-medium truncate min-w-0" : "text-muted-foreground truncate min-w-0"}>
                        {item.newName}
                      </span>
                    </div>
                  ))}
                  {remainingCount > 0 && (
                    <div className="px-3 py-2 text-sm text-muted-foreground text-center">
                      +{remainingCount} {t.app.moreFiles}
                    </div>
                  )}
                </div>
              </ScrollArea>
              {hasDuplicates && (
                <p className="text-xs text-destructive font-medium">
                  ⚠ Duplicate names detected — please adjust the pattern.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setBatchRenameOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleRename}
            disabled={
              !pattern.trim() ||
              selectedIds.length === 0 ||
              loading ||
              hasDuplicates ||
              !preview.some((p) => p.changed)
            }
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {loading ? t.app.renaming : t.app.rename}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
