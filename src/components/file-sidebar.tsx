"use client";

import { Folder, Star, Trash2, HardDrive, Cloud, Menu, X, Clock, Settings } from "lucide-react";
import { useFileStore, type Section } from "@/store/file-store";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "next-themes";
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

const navItems: { id: Section; label: string; icon: typeof Folder }[] = [
  { id: "files", label: "All Files", icon: Folder },
  { id: "recent", label: "Recent", icon: Clock },
  { id: "starred", label: "Starred", icon: Star },
  { id: "trash", label: "Trash", icon: Trash2 },
];

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { section, setSection, sidebarOpen, setSidebarOpen, setPreferencesOpen } = useFileStore();
  const { theme, setTheme } = useTheme();
  const [showStorageDetail, setShowStorageDetail] = useState(false);

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
      <div className="flex items-center gap-3 px-5 py-4 border-b border-sidebar-border/60">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-lg shadow-emerald-500/25 dark:shadow-emerald-500/10">
          <Cloud className="w-5 h-5" />
        </div>
        <div className="flex flex-col">
          <span className="text-lg font-bold tracking-tight leading-tight bg-gradient-to-r from-emerald-600 to-emerald-800 dark:from-emerald-400 dark:to-emerald-600 bg-clip-text text-transparent">CloudDrive</span>
          <span className="text-[10px] text-muted-foreground leading-tight">Personal Cloud Storage</span>
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
      <ScrollArea className="flex-1 px-3 py-3">
        <div className="px-2 mb-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Navigation</span>
        </div>
        <nav className="space-y-0.5">
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
                  "relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-gradient-to-r from-emerald-600/10 to-emerald-600/5 text-emerald-700 dark:text-emerald-400"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:translate-x-0.5"
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
      </ScrollArea>

      {/* User Profile Area */}
      <div className="border-t border-sidebar-border/60 px-3 py-3">
        <div
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-sidebar-accent/50 transition-all duration-200 cursor-pointer"
          onClick={() => setPreferencesOpen(true)}
        >
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white font-bold text-sm shadow-sm shadow-emerald-500/20 dark:shadow-emerald-500/10 shrink-0">
            U
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-sm font-semibold truncate leading-tight">My CloudDrive</span>
            <span className="text-[11px] text-muted-foreground leading-tight">
              {formatFileSize(usedBytes)} of {formatFileSize(totalBytes)} used
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
              Preferences
            </TooltipContent>
          </Tooltip>
        </div>
        {/* Theme toggle row */}
        <div className="flex items-center justify-between gap-2 mt-1.5 px-3">
          <div className="flex items-center gap-2">
            {theme === "dark" ? <Moon className="w-3.5 h-3.5 text-muted-foreground" /> : <Sun className="w-3.5 h-3.5 text-muted-foreground" />}
            <span className="text-[11px] text-muted-foreground">{theme === "dark" ? "Dark" : "Light"} Mode</span>
          </div>
          <Switch
            checked={theme === "dark"}
            onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
            className="scale-90"
          />
        </div>
      </div>

      {/* Storage Stats */}
      <div className="border-t border-sidebar-border/60" data-storage-section>
        <button 
          className="w-full px-4 py-3 hover:bg-sidebar-accent/50 transition-colors text-left"
          onClick={() => setShowStorageDetail(!showStorageDetail)}
        >
          <div className="flex items-center gap-2 mb-2">
            <HardDrive className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-semibold">Storage</span>
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
              {formatFileSize(usedBytes)} of {formatFileSize(totalBytes)}
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
              <div className="px-4 pb-3 space-y-1.5 border-t border-sidebar-border/50 pt-2">
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
                <div className="border-t border-sidebar-border/50 pt-1.5 mt-1.5 flex items-center justify-between text-xs font-medium">
                  <span>Free</span>
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

  if (isMobile) {
    return (
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-72 p-0 backdrop-blur-sm">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent onNavigate={() => setSidebarOpen(false)} />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside className="hidden md:flex w-[260px] shrink-0 border-r border-border/60 dark:border-border/40">
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
