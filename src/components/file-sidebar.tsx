"use client";

import { Folder, Star, Trash2, HardDrive, Cloud, Menu, X, Clock, Settings, LogOut, Shield, Zap, Package, Server, Globe, Network } from "lucide-react";
import { useFileStore, type Section } from "@/store/file-store";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "next-themes";
import { useSession, signOut } from "next-auth/react";
import { Moon, Sun } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { formatFileSize, type StorageStats } from "@/lib/file-utils";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useI18n } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/language-switcher";

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function DriverStatusSection() {
  const { t } = useI18n();
  const { data: driversData } = useQuery({
    queryKey: ["sidebar-drivers"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/admin/drivers");
        if (!res.ok) return null;
        return res.json();
      } catch {
        return null;
      }
    },
    refetchInterval: 60000,
  });

  const drivers: { id: string; name: string; type: string; status: string; healthy?: boolean }[] = driversData?.drivers || [];

  // Always show at least the local default driver
  const displayDrivers = drivers.length > 0 ? drivers : [
    { id: "default-local", name: "Local Storage", type: "local", status: "active", healthy: true },
  ];

  const getDriverIcon = (type: string) => {
    switch (type) {
      case "local": return Server;
      case "webdav": return Globe;
      case "s3": return Cloud;
      case "mount": return Network;
      default: return Cloud;
    }
  };

  const getStatusColor = (driver: { status: string; healthy?: boolean }) => {
    if (driver.status === "active" && driver.healthy !== false) return "bg-emerald-500";
    if (driver.status === "error" || driver.healthy === false) return "bg-red-500";
    return "bg-gray-400";
  };

  return (
    <div className="border-t border-border/40 mx-3 pt-3 pb-1">
      <div className="px-2 mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">{t.app.drivers}</span>
      </div>
      <div className="space-y-0.5">
        {displayDrivers.slice(0, 4).map((driver) => {
          const Icon = getDriverIcon(driver.type);
          return (
            <div
              key={driver.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] text-muted-foreground hover:bg-sidebar-accent/30 transition-colors"
            >
              <div className="relative">
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <div className={cn(
                  "absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-background",
                  getStatusColor(driver)
                )} />
              </div>
              <span className="truncate flex-1">{driver.name}</span>
              <span className={cn(
                "text-[9px] font-medium",
                driver.status === "active" && driver.healthy !== false ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"
              )}>
                {driver.status === "active" && driver.healthy !== false ? t.app.driverActive : driver.status === "error" ? t.app.driverError : t.app.driverInactive}
              </span>
            </div>
          );
        })}
        {drivers.length > 4 && (
          <p className="text-[10px] text-muted-foreground/60 px-2">+{drivers.length - 4} more</p>
        )}
      </div>
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { section, setSection, sidebarOpen, setSidebarOpen, setPreferencesOpen, setAdminPanelOpen } = useFileStore();
  const { theme, setTheme } = useTheme();
  const { data: sessionData } = useSession();
  const isAdmin = (sessionData?.user as Record<string, unknown>)?.role === "admin";
  const [showStorageDetail, setShowStorageDetail] = useState(false);
  const { t } = useI18n();

  const navItems: { id: Section; label: string; icon: typeof Folder }[] = [
    { id: "files", label: t.app.allFiles, icon: Folder },
    { id: "recent", label: t.app.recent, icon: Clock },
    { id: "starred", label: t.app.starred, icon: Star },
    { id: "quick-transfer", label: t.app.quickTransfer, icon: Zap },
    { id: "transfer-station", label: t.app.transferStation, icon: Package },
    { id: "trash", label: t.app.trash, icon: Trash2 },
  ];

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
  const totalBytes = stats?.totalBytes ?? 10737418240; // 10 GB default
  const usagePercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40">
        <div className="group/logo relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-lg shadow-emerald-500/25 dark:shadow-emerald-500/10 overflow-hidden">
          <Cloud className="w-5 h-5 relative z-10" />
          {/* Shimmer effect on hover */}
          <div className="absolute inset-0 -translate-x-full group-hover/logo:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
        </div>
        <div className="flex flex-col">
          <span className="text-lg font-bold tracking-tight leading-tight bg-gradient-to-r from-emerald-600 to-emerald-800 dark:from-emerald-400 dark:to-emerald-600 bg-clip-text text-transparent">CloudDrive</span>
          <span className="text-[10px] text-muted-foreground leading-tight">{t.app.personalCloudStorage}</span>
        </div>
        {onNavigate && (
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto md:hidden"
            onClick={onNavigate}
          >
            <X className="w-5 h-5" />
          </Button>
        )}
      </div>

      {/* Navigation */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="px-5 py-3">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">{t.app.navigation}</span>
          </div>
          <nav className="space-y-0.5 px-3">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = section === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setSection(item.id);
                    onNavigate?.();
                  }}
                  className={cn(
                    "relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 hover:scale-[1.01]",
                    isActive
                      ? "bg-gradient-to-r from-emerald-600/10 to-emerald-600/5 text-emerald-700 dark:text-emerald-400 shadow-sm shadow-emerald-500/10"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground hover:translate-x-0.5"
                  )}
                >
                  {/* Active indicator bar */}
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-active-indicator"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-emerald-600 dark:bg-emerald-400"
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    />
                  )}
                  <Icon
                    className={cn(
                      "w-5 h-5 transition-colors",
                      isActive && "text-emerald-600 dark:text-emerald-400"
                    )}
                  />
                  {item.label}
                  {item.id === "starred" && (stats?.starredCount ?? 0) > 0 && (
                    <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-[10px]">
                      {stats.starredCount}
                    </Badge>
                  )}
                  {item.id === "trash" && (stats?.trashedCount ?? 0) > 0 && (
                    <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-[10px]">
                      {stats.trashedCount}
                    </Badge>
                  )}
                </button>
              );
            })}
          </nav>
          {/* Admin Panel Button inside scroll area - clearly separated */}
          {isAdmin && (
            <div className="border-t border-border/60 px-4 py-3 mt-3 mx-1">
              <button
                onClick={() => {
                  setAdminPanelOpen(true);
                  onNavigate?.();
                }}
                className="relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 hover:scale-[1.01] text-sidebar-foreground/70 hover:bg-emerald-600/10 hover:text-emerald-700 dark:hover:text-emerald-400 hover:translate-x-0.5"
              >
                <Shield className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" />
                {t.app.adminPanel}
              </button>
            </div>
          )}
          {/* Storage Drivers Status */}
          <DriverStatusSection />

          {/* Quick Stats */}
          <div className="px-5 py-2 border-t border-border/40 mx-3">
            <p className="text-[11px] text-muted-foreground/70">
              {stats?.totalFiles ?? 0} {t.app.files} · {stats?.totalFolders ?? 0} {t.app.folders}
            </p>
          </div>
        </ScrollArea>
      </div>

      {/* User Profile Area */}
      <div className="border-t border-border/40 px-3 py-3">
        <div
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-sidebar-accent/50 transition-all duration-200 cursor-pointer"
          onClick={() => setPreferencesOpen(true)}
        >
          <div className="relative shrink-0">
            <Avatar className="w-9 h-9">
              <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-emerald-700 text-white font-bold text-sm shadow-sm shadow-emerald-500/20 dark:shadow-emerald-500/10">
                {sessionData?.user?.name?.charAt(0)?.toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            {/* Ring effect */}
            <div className="absolute -inset-1 rounded-full ring-2 ring-emerald-500/20 dark:ring-emerald-400/20" />
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-sm font-semibold truncate leading-tight">{sessionData?.user?.name || "My CloudDrive"}</span>
            <span className="text-[11px] text-muted-foreground leading-tight truncate">
              {sessionData?.user?.email || `${formatFileSize(usedBytes)} ${t.app.of} ${formatFileSize(totalBytes)} ${t.app.used}`}
            </span>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-md shrink-0"
                onClick={(e) => { e.stopPropagation(); setPreferencesOpen(true); }}
              >
                <Settings className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              {t.app.preferences}
            </TooltipContent>
          </Tooltip>
        </div>
        {/* Theme toggle row */}
        <div className="flex items-center justify-between gap-2 mt-1.5 px-3">
          <div className="flex items-center gap-2">
            {theme === "dark" ? <Moon className="w-3.5 h-3.5 text-muted-foreground" /> : <Sun className="w-3.5 h-3.5 text-muted-foreground" />}
            <span className="text-[11px] text-muted-foreground">{theme === "dark" ? t.app.darkMode : t.app.lightMode}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Switch
              checked={theme === "dark"}
              onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
              className="scale-90"
            />
          </div>
        </div>
        {/* Language switcher row */}
        <div className="flex items-center justify-between gap-2 mt-1.5 px-3">
          <LanguageSwitcher variant="ghost" />
        </div>
        {/* Sign out button */}
        <div className="mt-2 px-3">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive h-8 px-2 text-xs"
            onClick={() => signOut({ redirect: false })}
          >
            <LogOut className="w-3.5 h-3.5" />
            {t.app.signOut}
          </Button>
        </div>
      </div>

      {/* Storage Stats - More prominent */}
      <div className="border-t border-border/40" data-storage-section>
        <button 
          className="w-full px-4 py-4 hover:bg-sidebar-accent/50 transition-colors text-left"
          onClick={() => setShowStorageDetail(!showStorageDetail)}
        >
          <div className="flex items-center gap-2 mb-2.5">
            <HardDrive className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-xs font-bold uppercase tracking-wider">{t.app.storage}</span>
            <ChevronIcon className={cn("w-3.5 h-3.5 ml-auto text-muted-foreground transition-transform duration-200", showStorageDetail && "rotate-180")} />
          </div>
          <Progress value={usagePercent} className={cn("h-1.5 mb-2", usagePercent > 80 && "animate-pulse")} />
          {stats?.byType && Object.keys(stats.byType).length > 0 && (
            <div className="flex h-1 rounded-full overflow-hidden bg-muted/50">
              {Object.entries(stats.byType)
                .sort(([, a], [, b]) => (b as number) - (a as number))
                .map(([type, size]) => {
                  const percent = totalBytes > 0 ? ((size as number) / totalBytes) * 100 : 0;
                  return (
                    <div
                      key={type}
                      className={cn(
                        "h-full transition-all",
                        type === "image" && "bg-emerald-500",
                        type === "video" && "bg-rose-500",
                        type === "audio" && "bg-purple-500",
                        type === "document" && "bg-sky-500",
                        type === "code" && "bg-amber-500",
                        type === "archive" && "bg-orange-500",
                        type === "other" && "bg-gray-500",
                      )}
                      style={{ width: `${percent}%` }}
                    />
                  );
                })}
            </div>
          )}
          <div className="flex items-center justify-between mt-1.5">
            <p className="text-[11px] text-muted-foreground">
              {formatFileSize(usedBytes)} {t.app.of} {formatFileSize(totalBytes)}
            </p>
            <p className="text-[11px] font-semibold">
              {usagePercent.toFixed(usagePercent < 1 ? 2 : 0)}%
            </p>
          </div>
        </button>
        
        {/* Storage detail panel - expandable with animation */}
        <AnimatePresence initial={false}>
          {showStorageDetail && stats?.byType && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-3 space-y-1.5 border-t border-border/40 pt-2">
                {Object.entries(stats.byType)
                  .sort(([, a], [, b]) => (b as number) - (a as number))
                  .map(([type, size]) => (
                    <div key={type} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-2.5 h-2.5 rounded-full",
                          type === "image" && "bg-emerald-500",
                          type === "video" && "bg-rose-500",
                          type === "audio" && "bg-purple-500",
                          type === "document" && "bg-sky-500",
                          type === "code" && "bg-amber-500",
                          type === "archive" && "bg-orange-500",
                          type === "other" && "bg-gray-500",
                        )} />
                        <span className="capitalize">{type}</span>
                      </div>
                      <span className="text-muted-foreground">{formatFileSize(size as number)}</span>
                    </div>
                  ))}
                <div className="border-t border-border/40 pt-1.5 mt-1.5 flex items-center justify-between text-xs font-medium">
                  <span>{t.app.free}</span>
                  <span className="text-muted-foreground">{formatFileSize(totalBytes - usedBytes)}</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function FileSidebar() {
  const isMobile = useIsMobile();
  const { sidebarOpen, setSidebarOpen } = useFileStore();
  const { t } = useI18n();

  if (isMobile) {
    return (
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-72 p-0 backdrop-blur-sm">
          <SheetTitle className="sr-only">{t.app.navigation}</SheetTitle>
          <SidebarContent onNavigate={() => setSidebarOpen(false)} />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside className="hidden md:flex w-[260px] shrink-0 border-r border-border/60 dark:border-border/40 transition-all duration-300">
      <SidebarContent />
    </aside>
  );
}

export function MobileMenuButton() {
  const { setSidebarOpen } = useFileStore();

  return (
    <Button
      variant="ghost"
      size="icon"
      className="md:hidden"
      onClick={() => setSidebarOpen(true)}
    >
      <Menu className="w-5 h-5" />
    </Button>
  );
}
