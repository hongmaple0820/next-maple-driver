"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDate, formatFileSize } from "@/lib/file-utils";
import { History, Plus, RotateCcw, Clock, HardDrive } from "lucide-react";
import { toast } from "sonner";

interface VersionItem {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  version: number;
  createdAt: string;
}

interface VersionsResponse {
  versions: VersionItem[];
  currentVersion: number;
}

interface FileVersionPanelProps {
  fileId: string;
}

export function FileVersionPanel({ fileId }: FileVersionPanelProps) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<VersionsResponse>({
    queryKey: ["file-versions", fileId],
    queryFn: async () => {
      const res = await fetch(`/api/files/versions/${fileId}`);
      if (!res.ok) throw new Error("Failed to fetch versions");
      return res.json();
    },
    enabled: !!fileId,
  });

  const handleSaveVersion = async () => {
    try {
      const res = await fetch(`/api/files/versions/${fileId}`, {
        method: "POST",
      });
      if (res.ok) {
        toast.success("Version snapshot saved");
        queryClient.invalidateQueries({ queryKey: ["file-versions", fileId] });
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to save version");
      }
    } catch {
      toast.error("Failed to save version");
    }
  };

  const handleRestore = async (versionId: string, versionNumber: number) => {
    try {
      const res = await fetch(`/api/files/versions/${fileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId }),
      });
      if (res.ok) {
        toast.success(`Restored to version v${versionNumber}`);
        queryClient.invalidateQueries({ queryKey: ["file-versions", fileId] });
        queryClient.invalidateQueries({ queryKey: ["files"] });
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to restore version");
      }
    } catch {
      toast.error("Failed to restore version");
    }
  };

  const versions = data?.versions ?? [];
  const currentVersion = data?.currentVersion ?? 1;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <History className="w-3.5 h-3.5" />
          Version History
        </h4>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSaveVersion}
          className="h-7 text-xs gap-1"
        >
          <Plus className="w-3 h-3" />
          Save Version
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-12 rounded-md bg-muted/50 animate-pulse"
            />
          ))}
        </div>
      ) : versions.length === 0 ? (
        <div className="text-center py-4">
          <History className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No versions saved yet</p>
          <p className="text-xs text-muted-foreground/60 mt-0.5">
            Click &quot;Save Version&quot; to create a snapshot
          </p>
        </div>
      ) : (
        <ScrollArea className="max-h-64">
          <div className="space-y-1.5">
            <AnimatePresence mode="popLayout">
              {versions.map((v, index) => {
                const isCurrent =
                  index === 0 && v.version === currentVersion - 1;
                return (
                  <motion.div
                    key={v.id}
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{
                      duration: 0.2,
                      delay: index * 0.04,
                    }}
                    className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors group"
                  >
                    {/* Version badge + timeline line */}
                    <div className="flex flex-col items-center shrink-0">
                      <Badge
                        variant={isCurrent ? "default" : "secondary"}
                        className={`text-[10px] px-1.5 py-0 h-5 font-mono ${
                          isCurrent
                            ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                            : ""
                        }`}
                      >
                        v{v.version}
                      </Badge>
                    </div>

                    {/* Version info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium truncate">
                          {v.name}
                        </span>
                        {isCurrent && (
                          <Badge
                            variant="outline"
                            className="text-[9px] px-1 py-0 h-4 text-emerald-600 border-emerald-200 dark:border-emerald-800"
                          >
                            Current
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span className="flex items-center gap-0.5">
                          <HardDrive className="w-3 h-3" />
                          {formatFileSize(v.size)}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <Clock className="w-3 h-3" />
                          {formatDate(v.createdAt)}
                        </span>
                      </div>
                    </div>

                    {/* Restore button - only for non-current versions */}
                    {!isCurrent && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRestore(v.id, v.version)}
                        className="h-7 text-xs gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Restore
                      </Button>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </ScrollArea>
      )}

      {versions.length > 0 && (
        <p className="text-[11px] text-muted-foreground/60 text-center">
          {versions.length} version{versions.length !== 1 ? "s" : ""} saved
        </p>
      )}
    </div>
  );
}
