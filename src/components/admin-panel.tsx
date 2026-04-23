"use client";

import { useFileStore } from "@/store/file-store";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminUsersTab } from "@/components/admin/admin-users-tab";
import { AdminSystemTab } from "@/components/admin/admin-system-tab";
import { AdminDriversTab } from "@/components/admin/admin-drivers-tab";
import { AdminDiskTab } from "@/components/admin/admin-disk-tab";
import { Shield, Users, Activity, HardDrive, Database, Server, Cloud, CheckCircle2, XCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { formatFileSize, type StorageStats } from "@/lib/file-utils";
import { motion } from "framer-motion";

// Storage Drivers Overview Card
function StorageDriversOverview() {
  const { t } = useI18n();

  const { data: driversData } = useQuery({
    queryKey: ["admin-drivers-overview"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/admin/drivers");
        if (!res.ok) return null;
        return res.json();
      } catch {
        return null;
      }
    },
  });

  const { data: stats } = useQuery<StorageStats>({
    queryKey: ["storage-stats"],
    queryFn: async () => {
      const res = await fetch("/api/files/stats");
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
  });

  const drivers: { id: string; name: string; type: string; status: string; healthy?: boolean }[] = driversData?.drivers || [];
  const displayDrivers = drivers.length > 0 ? drivers : [
    { id: "default-local", name: "Local Storage", type: "local", status: "active", healthy: true },
  ];

  const totalDrivers = displayDrivers.length;
  const activeDrivers = displayDrivers.filter(d => d.status === "active" && d.healthy !== false).length;
  const usedBytes = stats?.usedBytes ?? 0;
  const totalBytes = stats?.totalBytes ?? 10737418240;
  const usagePercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;

  const getDriverIcon = (type: string) => {
    switch (type) {
      case "local": return Server;
      case "webdav": return Cloud;
      case "s3": return Cloud;
      case "mount": return Cloud;
      default: return HardDrive;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Card className="border-emerald-200/50 dark:border-emerald-800/30 bg-gradient-to-br from-emerald-50/50 to-white dark:from-emerald-950/20 dark:to-background overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-emerald-500/10">
              <HardDrive className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h3 className="text-sm font-bold">{t.admin.storageOverview || "Storage Drivers"}</h3>
          </div>
          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-background/60 border border-border/40">
              <Server className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{totalDrivers}</span>
              <span className="text-[10px] text-muted-foreground font-medium">Total</span>
            </div>
            <div className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-background/60 border border-border/40">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span className="text-xl font-bold text-emerald-600">{activeDrivers}</span>
              <span className="text-[10px] text-muted-foreground font-medium">Active</span>
            </div>
            <div className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-background/60 border border-border/40">
              <HardDrive className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-lg font-bold text-foreground">{formatFileSize(usedBytes)}</span>
              <span className="text-[10px] text-muted-foreground font-medium">of {formatFileSize(totalBytes)}</span>
            </div>
          </div>
          {/* Storage Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Storage Used</span>
              <span className={cn("font-semibold", usagePercent > 80 ? "text-amber-600" : "text-emerald-600")}>
                {usagePercent.toFixed(usagePercent < 1 ? 1 : 0)}%
              </span>
            </div>
            <Progress value={usagePercent} className={cn("h-2", usagePercent > 80 && "[&>div]:bg-amber-500")} />
          </div>
          {/* Driver List Mini */}
          <div className="mt-3 space-y-1.5">
            {displayDrivers.slice(0, 3).map((driver) => {
              const Icon = getDriverIcon(driver.type);
              const isActive = driver.status === "active" && driver.healthy !== false;
              return (
                <div key={driver.id} className="flex items-center gap-2 text-xs">
                  <div className="relative">
                    <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                    <div className={cn(
                      "absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-background",
                      isActive ? "bg-emerald-500" : "bg-red-500"
                    )} />
                  </div>
                  <span className="flex-1 truncate text-muted-foreground">{driver.name}</span>
                  {isActive ? (
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  ) : (
                    <XCircle className="w-3 h-3 text-red-500" />
                  )}
                </div>
              );
            })}
            {displayDrivers.length > 3 && (
              <p className="text-[10px] text-muted-foreground/60">+{displayDrivers.length - 3} more</p>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function AdminPanel() {
  const { adminPanelOpen, setAdminPanelOpen } = useFileStore();
  const { t } = useI18n();

  return (
    <Dialog open={adminPanelOpen} onOpenChange={setAdminPanelOpen}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] p-0 gap-0"
        onInteractOutside={(e) => {
          // Prevent closing when interacting with dropdown menus, popovers, or other portals inside the dialog
          e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          // Prevent closing when clicking on portal content (dropdowns, popovers)
          e.preventDefault();
        }}
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="p-1.5 rounded-lg bg-emerald-500/10">
              <Shield className="w-5 h-5 text-emerald-600" />
            </div>
            {t.app.adminPanel}
          </DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="system" className="flex-1 min-h-0">
          <div className="px-6 pt-2 border-b">
            <TabsList className="bg-transparent h-10 p-0 gap-1">
              <TabsTrigger
                value="system"
                className="data-[state=active]:bg-emerald-600/10 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400 rounded-md px-3 h-8 gap-1.5 text-sm"
              >
                <Activity className="w-3.5 h-3.5" />
                {t.admin.system}
              </TabsTrigger>
              <TabsTrigger
                value="users"
                className="data-[state=active]:bg-emerald-600/10 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400 rounded-md px-3 h-8 gap-1.5 text-sm"
              >
                <Users className="w-3.5 h-3.5" />
                {t.admin.users}
              </TabsTrigger>
              <TabsTrigger
                value="drivers"
                className="data-[state=active]:bg-emerald-600/10 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400 rounded-md px-3 h-8 gap-1.5 text-sm"
              >
                <HardDrive className="w-3.5 h-3.5" />
                {t.admin.storage}
              </TabsTrigger>
              <TabsTrigger
                value="disk"
                className="data-[state=active]:bg-emerald-600/10 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400 rounded-md px-3 h-8 gap-1.5 text-sm"
              >
                <Database className="w-3.5 h-3.5" />
                {t.admin.disk}
              </TabsTrigger>
            </TabsList>
          </div>
          <div className="px-6 py-4 overflow-y-auto max-h-[calc(90vh-130px)]">
            {adminPanelOpen && (
              <>
                {/* Storage Drivers Overview - shown at top */}
                <StorageDriversOverview />

                <TabsContent value="system" className="mt-4">
                  <AdminSystemTab />
                </TabsContent>
                <TabsContent value="users" className="mt-4">
                  <AdminUsersTab />
                </TabsContent>
                <TabsContent value="drivers" className="mt-4">
                  <AdminDriversTab />
                </TabsContent>
                <TabsContent value="disk" className="mt-4">
                  <AdminDiskTab />
                </TabsContent>
              </>
            )}
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
