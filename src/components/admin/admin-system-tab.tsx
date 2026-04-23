"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Users, FileText, Folder, Share2, HardDrive, Activity,
  CheckCircle2, AlertTriangle, Clock,
} from "lucide-react";
import { formatFileSize, formatRelativeTime } from "@/lib/file-utils";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

interface SystemStats {
  totalUsers: number;
  totalFiles: number;
  totalFolders: number;
  totalShares: number;
  activeShares: number;
  totalStorageUsed: number;
  byType: Record<string, number>;
  storageByUser: Array<{
    id: string;
    name: string;
    email: string;
    usedBytes: number;
    storageLimit: number;
  }>;
  recentActivity: Array<{
    id: string;
    name: string;
    type: string;
    action: string;
    updatedAt: string;
    userId: string | null;
  }>;
}

const typeColors: Record<string, string> = {
  image: "bg-emerald-500",
  video: "bg-rose-500",
  audio: "bg-purple-500",
  document: "bg-sky-500",
  code: "bg-amber-500",
  archive: "bg-orange-500",
  other: "bg-gray-500",
};

const typeLabelKeys: Record<string, "filterImages" | "filterVideos" | "filterAudio" | "filterDocs" | "filterCode" | "filterArchives" | "filterAll"> = {
  image: "filterImages",
  video: "filterVideos",
  audio: "filterAudio",
  document: "filterDocs",
  code: "filterCode",
  archive: "filterArchives",
  other: "filterAll",
};

const actionIcons: Record<string, typeof Activity> = {
  upload: Activity,
  create: Activity,
};

export function AdminSystemTab() {
  const { t } = useI18n();
  const { data, isLoading } = useQuery<SystemStats>({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/stats");
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-16 mb-2" />
                <Skeleton className="h-8 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const stats = data;
  if (!stats) return null;

  const totalStorage = stats.storageByUser.reduce((sum, u) => sum + u.storageLimit, 0);
  const totalUsed = stats.totalStorageUsed;

  const statCards = [
    {
      label: t.admin.totalUsers,
      value: stats.totalUsers,
      icon: Users,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-500/10",
    },
    {
      label: t.admin.totalFiles,
      value: stats.totalFiles,
      icon: FileText,
      color: "text-sky-600 dark:text-sky-400",
      bg: "bg-sky-500/10",
    },
    {
      label: t.admin.totalFolders,
      value: stats.totalFolders,
      icon: Folder,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-500/10",
    },
    {
      label: t.admin.activeShares,
      value: stats.activeShares,
      icon: Share2,
      color: "text-purple-600 dark:text-purple-400",
      bg: "bg-purple-500/10",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <Card key={card.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className={cn("p-1.5 rounded-lg", card.bg)}>
                  <card.icon className={cn("w-4 h-4", card.color)} />
                </div>
                <span className="text-xs text-muted-foreground">{card.label}</span>
              </div>
              <div className="text-2xl font-bold">{card.value.toLocaleString()}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Storage Overview & Health */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Storage Overview */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-emerald-600" />
              {t.admin.storageOverview}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>{t.admin.totalUsed}</span>
                <span className="font-medium">{formatFileSize(totalUsed)} / {formatFileSize(totalStorage)}</span>
              </div>
              <Progress value={totalStorage > 0 ? (totalUsed / totalStorage) * 100 : 0} className="h-2" />
            </div>

            {/* By Type */}
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground">{t.admin.byType}</span>
              {Object.entries(stats.byType)
                .sort(([, a], [, b]) => (b as number) - (a as number))
                .map(([type, size]) => (
                  <div key={type} className="flex items-center gap-2">
                    <div className={cn("w-2.5 h-2.5 rounded-full", typeColors[type] || "bg-gray-500")} />
                    <span className="text-sm flex-1">{t.app[typeLabelKeys[type] || "filterAll"]}</span>
                    <span className="text-sm text-muted-foreground">{formatFileSize(size as number)}</span>
                    <div className="w-20">
                      <Progress
                        value={totalUsed > 0 ? ((size as number) / totalUsed) * 100 : 0}
                        className="h-1.5"
                      />
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>

        {/* System Health */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-600" />
              {t.admin.systemHealth}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <div className="flex-1">
                <div className="text-sm font-medium">{t.admin.database}</div>
                <div className="text-xs text-muted-foreground">{t.admin.databaseDesc}</div>
              </div>
              <Badge className="bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 border-emerald-600/20">{t.admin.healthy}</Badge>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <div className="flex-1">
                <div className="text-sm font-medium">{t.admin.fileStorage}</div>
                <div className="text-xs text-muted-foreground">{t.admin.fileStorageDesc}</div>
              </div>
              <Badge className="bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 border-emerald-600/20">{t.admin.healthy}</Badge>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-sky-500/5 border border-sky-500/20">
              <Share2 className="w-5 h-5 text-sky-600" />
              <div className="flex-1">
                <div className="text-sm font-medium">{t.admin.shareLinks}</div>
                <div className="text-xs text-muted-foreground">{stats.activeShares} active / {stats.totalShares} total</div>
              </div>
              <Badge className="bg-sky-600/10 text-sky-700 dark:text-sky-400 border-sky-600/20">{t.admin.active}</Badge>
            </div>
            {totalUsed / totalStorage > 0.8 && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <div className="flex-1">
                  <div className="text-sm font-medium">{t.admin.storageWarning}</div>
                  <div className="text-xs text-muted-foreground">{t.admin.storageWarningDesc} {((totalUsed / totalStorage) * 100).toFixed(0)}%</div>
                </div>
                <Badge className="bg-amber-600/10 text-amber-700 dark:text-amber-400 border-amber-600/20">{t.admin.warning}</Badge>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Storage by User & Recent Activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Storage by User Chart */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-600" />
              {t.admin.storageByUser}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {stats.storageByUser.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">{t.admin.noUsers}</div>
              ) : (
                stats.storageByUser
                  .sort((a, b) => b.usedBytes - a.usedBytes)
                  .map((user) => {
                    const usagePercent = user.storageLimit > 0 ? (user.usedBytes / user.storageLimit) * 100 : 0;
                    return (
                      <div key={user.id} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium truncate">{user.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatFileSize(user.usedBytes)} / {formatFileSize(user.storageLimit)}
                          </span>
                        </div>
                        <Progress value={Math.min(usagePercent, 100)} className="h-2" />
                      </div>
                    );
                  })
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-600" />
              {t.admin.recentActivity}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {stats.recentActivity.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">{t.admin.noRecentActivity}</div>
              ) : (
                stats.recentActivity.map((activity) => {
                  const Icon = actionIcons[activity.action] || Activity;
                  return (
                    <div key={activity.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="p-1.5 rounded-lg bg-emerald-500/10">
                        <Icon className="w-3.5 h-3.5 text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{activity.name}</div>
                        <div className="text-xs text-muted-foreground capitalize">{activity.action} · {activity.type}</div>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatRelativeTime(activity.updatedAt)}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
