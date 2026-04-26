"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Activity, Download, Upload, Trash2, Share2, Search,
  Filter, FileText, Clock, ArrowUpDown, BarChart3,
  TrendingUp, Calendar, User, File, Folder, ArrowDownToLine,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { formatFileSize, formatRelativeTime } from "@/lib/file-utils";
import { motion } from "framer-motion";
import { Label as UILabel } from "@/components/ui/label";
import { Label as UILabel } from "@/components/ui/label";

// --- Types ---

interface ActivityEntry {
  id: string;
  name: string;
  type: string;
  action: string;
  updatedAt: string;
  userId: string | null;
}

interface DailyStat {
  date: string;
  count: number;
}

// --- Action Config ---

const actionConfig: Record<string, { color: string; bg: string; icon: typeof Activity; label: string }> = {
  upload: { color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10", icon: Upload, label: "Upload" },
  create: { color: "text-sky-600 dark:text-sky-400", bg: "bg-sky-500/10", icon: FileText, label: "Create" },
  download: { color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-500/10", icon: Download, label: "Download" },
  delete: { color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10", icon: Trash2, label: "Delete" },
  move: { color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10", icon: ArrowUpDown, label: "Move" },
  share: { color: "text-pink-600 dark:text-pink-400", bg: "bg-pink-500/10", icon: Share2, label: "Share" },
  rename: { color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-500/10", icon: FileText, label: "Rename" },
};

// --- Main Component ---

export function AdminActivityTab() {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const [filterAction, setFilterAction] = useState<string>("all");
  const [filterUser, setFilterUser] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const pageSize = 15;

  const { data, isLoading } = useQuery<{
    recentActivity: ActivityEntry[];
    storageByUser: Array<{ id: string; name: string; email: string; usedBytes: number; storageLimit: number }>;
  }>({
    queryKey: ["admin-activity"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/admin/stats");
        if (!res.ok) return { recentActivity: [], storageByUser: [] };
        const data = await res.json();
        return {
          recentActivity: data.recentActivity || [],
          storageByUser: data.storageByUser || [],
        };
      } catch {
        return { recentActivity: [], storageByUser: [] };
      }
    },
  });

  const activities = data?.recentActivity || [];
  const users = data?.storageByUser || [];

  // Create user lookup map
  const userMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of users) {
      map[u.id] = u.name;
    }
    return map;
  }, [users]);

  // Filter activities
  const filteredActivities = useMemo(() => {
    let result = activities;

    if (filterAction !== "all") {
      result = result.filter(a => a.action === filterAction);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(a => a.name.toLowerCase().includes(q));
    }

    if (filterUser) {
      result = result.filter(a => {
        const userName = a.userId ? (userMap[a.userId] || "") : "";
        return userName.toLowerCase().includes(filterUser.toLowerCase());
      });
    }

    if (filterDateFrom) {
      const from = new Date(filterDateFrom).getTime();
      result = result.filter(a => new Date(a.updatedAt).getTime() >= from);
    }

    if (filterDateTo) {
      const to = new Date(filterDateTo).getTime() + 86400000; // end of day
      result = result.filter(a => new Date(a.updatedAt).getTime() <= to);
    }

    return result;
  }, [activities, filterAction, searchQuery, filterUser, filterDateFrom, filterDateTo, userMap]);

  // Paginate
  const totalPages = Math.max(1, Math.ceil(filteredActivities.length / pageSize));
  const paginatedActivities = filteredActivities.slice((page - 1) * pageSize, page * pageSize);

  // Generate daily stats from activities
  const dailyStats: DailyStat[] = useMemo(() => {
    const statMap: Record<string, number> = {};
    for (const a of activities) {
      const date = new Date(a.updatedAt).toISOString().split("T")[0];
      statMap[date] = (statMap[date] || 0) + 1;
    }
    // Fill in last 7 days
    const result: DailyStat[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      result.push({
        date: dateStr,
        count: statMap[dateStr] || 0,
      });
    }
    return result;
  }, [activities]);

  const maxDailyCount = Math.max(...dailyStats.map(d => d.count), 1);

  // Export CSV
  const handleExportCSV = () => {
    const headers = ["File", "Action", "Type", "User", "Time"];
    const rows = filteredActivities.map(a => [
      a.name,
      a.action,
      a.type,
      a.userId ? (userMap[a.userId] || "Unknown") : "System",
      new Date(a.updatedAt).toLocaleString(),
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `activity-log-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Reset filters
  const handleResetFilters = () => {
    setFilterAction("all");
    setFilterUser("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setSearchQuery("");
    setPage(1);
  };

  const hasActiveFilters = filterAction !== "all" || filterUser || filterDateFrom || filterDateTo || searchQuery;

  return (
    <div className="space-y-4">
      {/* Activity Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Daily Activity Chart */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-500/10">
                <BarChart3 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              {t.admin.activityStats || "Activity Statistics"}
            </CardTitle>
            <CardDescription className="text-xs">
              Uploads per day (last 7 days)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2 h-20">
              {dailyStats.map((stat, idx) => {
                const barHeight = maxDailyCount > 0 ? (stat.count / maxDailyCount) * 100 : 0;
                const dayLabel = new Date(stat.date).toLocaleDateString(undefined, { weekday: "short" });
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {stat.count > 0 ? stat.count : ""}
                    </span>
                    <div
                      className="w-full rounded-t-sm transition-all duration-300"
                      style={{ height: `${Math.max(barHeight, 4)}%`, minHeight: "4px" }}
                    >
                      <div className={cn(
                        "w-full h-full rounded-t-sm",
                        idx === dailyStats.length - 1
                          ? "bg-emerald-500 dark:bg-emerald-400"
                          : "bg-emerald-500/30 dark:bg-emerald-400/20"
                      )} />
                    </div>
                    <span className="text-[9px] text-muted-foreground">{dayLabel}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Summary Stats */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-sky-500/10">
                <TrendingUp className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              </div>
              {t.admin.activitySummary || "Activity Summary"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(actionConfig).map(([action, config]) => {
                const count = activities.filter(a => a.action === action).length;
                if (count === 0 && action !== "upload" && action !== "create") return null;
                const Icon = config.icon;
                return (
                  <div key={action} className="flex items-center gap-3">
                    <div className={cn("p-1.5 rounded-md", config.bg)}>
                      <Icon className={cn("w-3.5 h-3.5", config.color)} />
                    </div>
                    <span className="text-sm flex-1">{config.label}</span>
                    <span className="text-sm font-bold">{count}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">{t.admin.filters || "Filters"}</span>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={handleResetFilters}>
                {t.admin.resetFilters || "Reset"}
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            <div className="space-y-1">
              <UILabel className="text-xs">{t.admin.search || "Search"}</UILabel>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                  placeholder="Search files..."
                  className="h-8 pl-8 text-sm"
                />
              </div>
            </div>
            <div className="space-y-1">
              <UILabel className="text-xs">{t.admin.actionType || "Action Type"}</UILabel>
              <Select value={filterAction} onValueChange={(v) => { setFilterAction(v); setPage(1); }}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t.admin.allActions || "All Actions"}</SelectItem>
                  {Object.entries(actionConfig).map(([key, config]) => (
                    <SelectItem key={key} value={key}>{config.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <UILabel className="text-xs">{t.admin.user || "User"}</UILabel>
              <Input
                value={filterUser}
                onChange={(e) => { setFilterUser(e.target.value); setPage(1); }}
                placeholder="Filter by user..."
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <UILabel className="text-xs">{t.admin.dateFrom || "From"}</UILabel>
              <Input
                type="date"
                value={filterDateFrom}
                onChange={(e) => { setFilterDateFrom(e.target.value); setPage(1); }}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <UILabel className="text-xs">{t.admin.dateTo || "To"}</UILabel>
              <Input
                type="date"
                value={filterDateTo}
                onChange={(e) => { setFilterDateTo(e.target.value); setPage(1); }}
                className="h-8 text-sm"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Activity Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-purple-500/10 dark:bg-purple-500/20">
                <Activity className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              </div>
              {t.admin.activityLog || "Activity Log"}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">
                {filteredActivities.length} {t.admin.entries || "entries"}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-8"
                onClick={handleExportCSV}
                disabled={filteredActivities.length === 0}
              >
                <ArrowDownToLine className="w-3.5 h-3.5" />
                {t.admin.exportCSV || "Export CSV"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : filteredActivities.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <Activity className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">{t.admin.noRecentActivity}</p>
              {hasActiveFilters && (
                <Button variant="link" size="sm" onClick={handleResetFilters} className="mt-2">
                  {t.admin.resetFilters || "Reset filters"}
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="dark:border-white/10">
                      <TableHead className="w-[40px]"></TableHead>
                      <TableHead>{t.admin.name || "File"}</TableHead>
                      <TableHead>{t.admin.action || "Action"}</TableHead>
                      <TableHead>{t.admin.user || "User"}</TableHead>
                      <TableHead>{t.admin.type || "Type"}</TableHead>
                      <TableHead className="text-right">{t.admin.time || "Time"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedActivities.map((activity) => {
                      const config = actionConfig[activity.action] || actionConfig.create;
                      const Icon = config.icon;
                      const userName = activity.userId ? (userMap[activity.userId] || "Unknown") : "System";
                      return (
                        <TableRow key={activity.id} className="dark:border-white/5">
                          <TableCell>
                            <div className={cn("p-1.5 rounded-lg", config.bg)}>
                              <Icon className={cn("w-3.5 h-3.5", config.color)} />
                            </div>
                          </TableCell>
                          <TableCell className="font-medium text-sm max-w-[200px] truncate">
                            {activity.name}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn("text-[10px] gap-1 dark:border-white/15", config.color, config.bg)}>
                              <Icon className="w-3 h-3" />
                              {config.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            <div className="flex items-center gap-1.5">
                              <User className="w-3 h-3" />
                              {userName}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              {activity.type === "folder" ? <Folder className="w-3 h-3" /> : <File className="w-3 h-3" />}
                              {activity.type}
                            </div>
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

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <span className="text-xs text-muted-foreground">
                    {t.admin.showing || "Showing"} {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filteredActivities.length)} {t.admin.of || "of"} {filteredActivities.length}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                    >
                      {t.admin.previous || "Previous"}
                    </Button>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      const pageNum = i + 1;
                      return (
                        <Button
                          key={pageNum}
                          variant={page === pageNum ? "default" : "outline"}
                          size="sm"
                          className={cn("h-7 w-7 p-0 text-xs", page === pageNum && "bg-emerald-600 hover:bg-emerald-700")}
                          onClick={() => setPage(pageNum)}
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={page >= totalPages}
                      onClick={() => setPage(page + 1)}
                    >
                      {t.admin.next || "Next"}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FilterLabel({ className, children }: { className?: string; children: React.ReactNode }) {
  return <label className={cn("text-xs font-medium text-muted-foreground", className)}>{children}</label>;
}
