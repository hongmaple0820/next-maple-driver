"use client";

import { Folder, Star, Trash2, HardDrive, Cloud, Menu, X, Clock } from "lucide-react";
import { useFileStore, type Section } from "@/store/file-store";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { formatFileSize, type StorageStats } from "@/lib/file-utils";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

const navItems: { id: Section; label: string; icon: typeof Folder }[] = [
  { id: "files", label: "All Files", icon: Folder },
  { id: "recent", label: "Recent", icon: Clock },
  { id: "starred", label: "Starred", icon: Star },
  { id: "trash", label: "Trash", icon: Trash2 },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { section, setSection, sidebarOpen, setSidebarOpen } = useFileStore();
  const { theme, setTheme } = useTheme();

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
      <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-600 text-white">
          <Cloud className="w-5 h-5" />
        </div>
        <span className="text-lg font-bold tracking-tight">CloudDrive</span>
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
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-1">
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
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                  isActive
                    ? "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <Icon
                  className={cn(
                    "w-5 h-5",
                    isActive && "text-emerald-600 dark:text-emerald-400"
                  )}
                />
                {item.label}
              </button>
            );
          })}
        </nav>
      </ScrollArea>

      {/* Dark Mode Toggle */}
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {theme === "dark" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          <span className="text-xs font-medium">Dark Mode</span>
        </div>
        <Switch
          checked={theme === "dark"}
          onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
        />
      </div>

      {/* Storage Stats */}
      <div className="border-t border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-2 mb-2">
          <HardDrive className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Storage</span>
        </div>
        <Progress value={usagePercent} className="h-2 mb-2" />
        {stats?.byType && Object.keys(stats.byType).length > 0 && (
          <div className="mb-2 flex h-2 rounded-full overflow-hidden bg-muted">
            {Object.entries(stats.byType)
              .sort(([, a], [, b]) => (b as number) - (a as number))
              .map(([type, size]) => {
                const percent = usedBytes > 0 ? ((size as number) / totalBytes) * 100 : 0;
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
                    title={`${type}: ${formatFileSize(size as number)}`}
                  />
                );
              })}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {formatFileSize(usedBytes)} of {formatFileSize(totalBytes)} used
        </p>
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
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent onNavigate={() => setSidebarOpen(false)} />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside className="hidden md:flex w-[280px] shrink-0 border-r border-border">
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
