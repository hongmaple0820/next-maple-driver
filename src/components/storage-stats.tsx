"use client";

import { useQuery } from "@tanstack/react-query";
import { HardDrive, File, Folder, Image, Film, Music, FileText, FileCode, Archive } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { StorageStats } from "@/lib/file-utils";
import { formatFileSize } from "@/lib/file-utils";

const typeIcons: Record<string, typeof File> = {
  image: Image,
  video: Film,
  audio: Music,
  document: FileText,
  code: FileCode,
  archive: Archive,
};

export function StorageStatsPanel() {
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
  const totalBytes = stats?.totalBytes ?? 10737418240;
  const usagePercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Overview */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <HardDrive className="w-5 h-5 text-emerald-600" />
          <h3 className="font-semibold">Storage Overview</h3>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Used</span>
            <span className="font-medium">{formatFileSize(usedBytes)}</span>
          </div>
          <Progress value={usagePercent} className="h-3" />
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {usagePercent.toFixed(1)}% of {formatFileSize(totalBytes)}
            </span>
            <span className="text-muted-foreground">
              {formatFileSize(totalBytes - usedBytes)} free
            </span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
          <Folder className="w-5 h-5 text-amber-500" />
          <div>
            <p className="text-xl font-bold">{stats?.totalFolders ?? 0}</p>
            <p className="text-xs text-muted-foreground">Folders</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
          <File className="w-5 h-5 text-sky-500" />
          <div>
            <p className="text-xl font-bold">{stats?.totalFiles ?? 0}</p>
            <p className="text-xs text-muted-foreground">Files</p>
          </div>
        </div>
      </div>

      {/* Breakdown by type */}
      {stats?.byType && Object.keys(stats.byType).length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-3">Storage by Type</h4>
          <div className="space-y-2">
            {Object.entries(stats.byType)
              .sort(([, a], [, b]) => (b as number) - (a as number))
              .map(([type, size]) => {
                const Icon = typeIcons[type] || File;
                const percent = usedBytes > 0 ? ((size as number) / usedBytes) * 100 : 0;
                return (
                  <div key={type} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-muted-foreground" />
                        <span className="capitalize">{type}</span>
                      </div>
                      <span className="text-muted-foreground">
                        {formatFileSize(size as number)} ({percent.toFixed(0)}%)
                      </span>
                    </div>
                    <Progress value={percent} className="h-1.5" />
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
