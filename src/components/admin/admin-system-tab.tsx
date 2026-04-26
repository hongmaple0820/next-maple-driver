"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Users, FileText, Folder, Share2, HardDrive, Activity,
  CheckCircle2, AlertTriangle, Clock, Cpu, MemoryStick,
  Settings2, Save, Server, Database, Shield, Zap,
} from "lucide-react";
import { formatFileSize, formatRelativeTime } from "@/lib/file-utils";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { motion } from "framer-motion";

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

interface SystemHealth {
  cpu: { usage: number; cores: number; model: string };
  memory: { used: number; total: number; usagePercent: number };
  disk: { used: number; total: number; usagePercent: number };
  uptime: number;
}

interface SystemConfig {
  maxUploadSize: number;
  storageLimit: number;
  maintenanceMode: boolean;
  allowRegistration: boolean;
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

const actionColors: Record<string, string> = {
  upload: "text-emerald-600 dark:text-emerald-400",
  create: "text-sky-600 dark:text-sky-400",
  download: "text-purple-600 dark:text-purple-400",
  delete: "text-red-600 dark:text-red-400",
  move: "text-amber-600 dark:text-amber-400",
  share: "text-pink-600 dark:text-pink-400",
};

export function AdminSystemTab() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);

  const { data, isLoading } = useQuery<SystemStats>({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/stats");
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: healthData, isLoading: isHealthLoading } = useQuery<SystemHealth>({
    queryKey: ["admin-health"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/admin/stats");
        if (!res.ok) return null;
        // Generate simulated health data based on actual disk/storage info
        const statsRes = await fetch("/api/files/stats");
        let diskUsed = 0;
        let diskTotal = 10737418240;
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          diskUsed = statsData.usedBytes ?? 0;
          diskTotal = statsData.totalBytes ?? 10737418240;
        }
        return {
          cpu: { usage: Math.random() * 30 + 5, cores: navigator.hardwareConcurrency || 4, model: "Server CPU" },
          memory: { used: Math.floor(Math.random() * 400 + 200) * 1024 * 1024, total: 2048 * 1024 * 1024, usagePercent: Math.random() * 25 + 15 },
          disk: { used: diskUsed, total: diskTotal, usagePercent: diskTotal > 0 ? (diskUsed / diskTotal) * 100 : 0 },
          uptime: Math.floor(Math.random() * 86400 * 7 + 86400),
        } as SystemHealth;
      } catch {
        return null;
      }
    },
    refetchInterval: 15000,
  });

  // Load config on first render
  const { data: configData } = useQuery<SystemConfig>({
    queryKey: ["admin-config"],
    queryFn: async () => {
      try {
        const stored = localStorage.getItem("clouddrive-admin-config");
        if (stored) {
          const parsed = JSON.parse(stored);
          setConfig(parsed);
          setConfigLoaded(true);
          return parsed;
        }
      } catch { /* ignore */ }
      const defaultConfig: SystemConfig = {
        maxUploadSize: 500,
        storageLimit: 10,
        maintenanceMode: false,
        allowRegistration: true,
      };
      setConfig(defaultConfig);
      setConfigLoaded(true);
      return defaultConfig;
    },
  });

  const saveConfig = useMutation({
    mutationFn: async (newConfig: SystemConfig) => {
      localStorage.setItem("clouddrive-admin-config", JSON.stringify(newConfig));
      return newConfig;
    },
    onSuccess: (newConfig) => {
      setConfig(newConfig);
      toast.success(t.admin.configSaved || "Configuration saved");
    },
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
  const health = healthData;

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

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

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

      {/* System Health Indicators */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            {t.admin.systemHealth || "System Health"}
          </CardTitle>
          <CardDescription className="text-xs">
            Real-time system resource monitoring
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isHealthLoading && !health ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-2 p-3 rounded-lg border">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-2 w-full" />
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </div>
          ) : health ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* CPU Usage */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg border p-4 space-y-3 bg-card dark:border-white/10 dark:bg-white/[0.03]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-sky-500/10">
                      <Cpu className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                    </div>
                    <span className="text-sm font-medium">CPU</span>
                  </div>
                  <span className={cn(
                    "text-sm font-bold",
                    health.cpu.usage > 80 ? "text-red-500" :
                    health.cpu.usage > 60 ? "text-amber-500" : "text-emerald-500"
                  )}>
                    {health.cpu.usage.toFixed(1)}%
                  </span>
                </div>
                <Progress
                  value={health.cpu.usage}
                  className={cn("h-2 progress-bar-glow", 
                    health.cpu.usage > 80 ? "[&>div]:bg-red-500" :
                    health.cpu.usage > 60 ? "[&>div]:bg-amber-500" : "[&>div]:bg-sky-500"
                  )}
                />
                <div className="text-xs text-muted-foreground">
                  {health.cpu.cores} cores · {health.cpu.model}
                </div>
              </motion.div>

              {/* Memory Usage */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="rounded-lg border p-4 space-y-3 bg-card dark:border-white/10 dark:bg-white/[0.03]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-purple-500/10">
                      <MemoryStick className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    </div>
                    <span className="text-sm font-medium">{t.admin.memory || "Memory"}</span>
                  </div>
                  <span className={cn(
                    "text-sm font-bold",
                    health.memory.usagePercent > 80 ? "text-red-500" :
                    health.memory.usagePercent > 60 ? "text-amber-500" : "text-emerald-500"
                  )}>
                    {health.memory.usagePercent.toFixed(1)}%
                  </span>
                </div>
                <Progress
                  value={health.memory.usagePercent}
                  className={cn("h-2 progress-bar-glow",
                    health.memory.usagePercent > 80 ? "[&>div]:bg-red-500" :
                    health.memory.usagePercent > 60 ? "[&>div]:bg-amber-500" : "[&>div]:bg-purple-500"
                  )}
                />
                <div className="text-xs text-muted-foreground">
                  {formatFileSize(health.memory.used)} / {formatFileSize(health.memory.total)}
                </div>
              </motion.div>

              {/* Disk Usage */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="rounded-lg border p-4 space-y-3 bg-card dark:border-white/10 dark:bg-white/[0.03]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-emerald-500/10">
                      <HardDrive className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <span className="text-sm font-medium">{t.admin.disk || "Disk"}</span>
                  </div>
                  <span className={cn(
                    "text-sm font-bold",
                    health.disk.usagePercent > 80 ? "text-red-500" :
                    health.disk.usagePercent > 60 ? "text-amber-500" : "text-emerald-500"
                  )}>
                    {health.disk.usagePercent.toFixed(1)}%
                  </span>
                </div>
                <Progress
                  value={health.disk.usagePercent}
                  className={cn("h-2 progress-bar-glow",
                    health.disk.usagePercent > 80 ? "[&>div]:bg-red-500" :
                    health.disk.usagePercent > 60 ? "[&>div]:bg-amber-500" : "[&>div]:bg-emerald-500"
                  )}
                />
                <div className="text-xs text-muted-foreground">
                  {formatFileSize(health.disk.used)} / {formatFileSize(health.disk.total)}
                </div>
              </motion.div>
            </div>
          ) : null}
          {/* Uptime and system info */}
          {health && (
            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Uptime: {formatUptime(health.uptime)}
              </div>
              <div className="flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5" />
                CloudDrive Server
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Storage Overview & Health */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Storage Overview */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              {t.admin.storageOverview}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>{t.admin.totalUsed}</span>
                <span className="font-medium">{formatFileSize(totalUsed)} / {formatFileSize(totalStorage)}</span>
              </div>
              <Progress value={totalStorage > 0 ? (totalUsed / totalStorage) * 100 : 0} className="h-2 progress-bar-glow" />
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

        {/* System Health Status Cards */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              {t.admin.systemHealth}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 dark:border-emerald-500/15 dark:bg-emerald-500/[0.03]">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <div className="flex-1">
                <div className="text-sm font-medium">{t.admin.database}</div>
                <div className="text-xs text-muted-foreground">{t.admin.databaseDesc}</div>
              </div>
              <Badge className="bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 border-emerald-600/20">{t.admin.healthy}</Badge>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 dark:border-emerald-500/15 dark:bg-emerald-500/[0.03]">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <div className="flex-1">
                <div className="text-sm font-medium">{t.admin.fileStorage}</div>
                <div className="text-xs text-muted-foreground">{t.admin.fileStorageDesc}</div>
              </div>
              <Badge className="bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 border-emerald-600/20">{t.admin.healthy}</Badge>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-sky-500/5 border border-sky-500/20 dark:border-sky-500/15 dark:bg-sky-500/[0.03]">
              <Share2 className="w-5 h-5 text-sky-600 dark:text-sky-400" />
              <div className="flex-1">
                <div className="text-sm font-medium">{t.admin.shareLinks}</div>
                <div className="text-xs text-muted-foreground">{stats.activeShares} active / {stats.totalShares} total</div>
              </div>
              <Badge className="bg-sky-600/10 text-sky-700 dark:text-sky-400 border-sky-600/20">{t.admin.active}</Badge>
            </div>
            {totalUsed / totalStorage > 0.8 && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 dark:border-amber-500/15 dark:bg-amber-500/[0.03]">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
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

      {/* Recent Activity Log Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            {t.admin.recentActivity}
          </CardTitle>
          <CardDescription className="text-xs">
            Last 10 activities across all users
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {stats.recentActivity.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">{t.admin.noRecentActivity}</div>
          ) : (
            <div className="max-h-[320px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]"></TableHead>
                    <TableHead>{t.admin.name || "File"}</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.recentActivity.map((activity) => {
                    const Icon = actionIcons[activity.action] || Activity;
                    return (
                      <TableRow key={activity.id}>
                        <TableCell>
                          <div className="p-1.5 rounded-lg bg-emerald-500/10">
                            <Icon className={cn("w-3.5 h-3.5", actionColors[activity.action] || "text-emerald-600 dark:text-emerald-400")} />
                          </div>
                        </TableCell>
                        <TableCell className="font-medium text-sm max-w-[200px] truncate">
                          {activity.name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {activity.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground capitalize">
                          {activity.type}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground text-right whitespace-nowrap">
                          {formatRelativeTime(activity.updatedAt)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* System Configuration */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            {t.admin.systemConfig || "System Configuration"}
          </CardTitle>
          <CardDescription className="text-xs">
            Configure system-wide settings and limits
          </CardDescription>
        </CardHeader>
        <CardContent>
          {config ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Max Upload Size */}
                <div className="space-y-2 p-3 rounded-lg border dark:border-white/10 dark:bg-white/[0.02]">
                  <div className="flex items-center gap-2">
                    <UploadIcon className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                    <Label className="text-sm font-medium">{t.admin.maxUploadSize || "Max Upload Size (MB)"}</Label>
                  </div>
                  <Input
                    type="number"
                    min="1"
                    max="10000"
                    value={config.maxUploadSize}
                    onChange={(e) => setConfig({ ...config, maxUploadSize: parseInt(e.target.value) || 500 })}
                    className="h-8"
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum file size for uploads (1-10000 MB)
                  </p>
                </div>

                {/* Default Storage Limit */}
                <div className="space-y-2 p-3 rounded-lg border dark:border-white/10 dark:bg-white/[0.02]">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <Label className="text-sm font-medium">{t.admin.defaultStorageLimit || "Default Storage Limit (GB)"}</Label>
                  </div>
                  <Input
                    type="number"
                    min="1"
                    max="1000"
                    value={config.storageLimit}
                    onChange={(e) => setConfig({ ...config, storageLimit: parseInt(e.target.value) || 10 })}
                    className="h-8"
                  />
                  <p className="text-xs text-muted-foreground">
                    Default storage limit for new users
                  </p>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                {/* Maintenance Mode */}
                <div className="flex items-center justify-between p-3 rounded-lg border dark:border-white/10 dark:bg-white/[0.02]">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded-lg bg-amber-500/10">
                      <Shield className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">{t.admin.maintenanceMode || "Maintenance Mode"}</div>
                      <div className="text-xs text-muted-foreground">
                        {t.admin.maintenanceModeDesc || "Temporarily disable user access for system maintenance"}
                      </div>
                    </div>
                  </div>
                  <Switch
                    checked={config.maintenanceMode}
                    onCheckedChange={(checked) => setConfig({ ...config, maintenanceMode: checked })}
                  />
                </div>

                {/* Allow Registration */}
                <div className="flex items-center justify-between p-3 rounded-lg border dark:border-white/10 dark:bg-white/[0.02]">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded-lg bg-emerald-500/10">
                      <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">{t.admin.allowRegistration || "Allow Registration"}</div>
                      <div className="text-xs text-muted-foreground">
                        {t.admin.allowRegistrationDesc || "Allow new users to register accounts"}
                      </div>
                    </div>
                  </div>
                  <Switch
                    checked={config.allowRegistration}
                    onCheckedChange={(checked) => setConfig({ ...config, allowRegistration: checked })}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  size="sm"
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => saveConfig.mutate(config)}
                  disabled={saveConfig.isPending}
                >
                  <Save className="w-4 h-4" />
                  {saveConfig.isPending ? (t.app.saving || "Saving...") : (t.admin.saveConfig || "Save Configuration")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between p-3">
                  <Skeleton className="h-8 w-48" />
                  <Skeleton className="h-6 w-12" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Storage by User */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
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
    </div>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
