"use client";

import { useState } from "react";
import { Bell, X, Upload, Download, Pencil, Trash2, Star, Share2, FolderInput, Copy, FolderPlus } from "lucide-react";
import { useFileStore, type ActivityItem } from "@/store/file-store";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import type { TranslationKeys } from "@/lib/i18n/translations";

type ActionLabelKey = "uploaded" | "downloaded" | "renamed" | "deleted" | "starredAction" | "shared" | "moved" | "copied" | "created";

const actionConfig: Record<ActivityItem["action"], { icon: typeof Bell; labelKey: ActionLabelKey; color: string }> = {
  upload: { icon: Upload, labelKey: "uploaded", color: "text-emerald-500" },
  download: { icon: Download, labelKey: "downloaded", color: "text-sky-500" },
  rename: { icon: Pencil, labelKey: "renamed", color: "text-amber-500" },
  delete: { icon: Trash2, labelKey: "deleted", color: "text-destructive" },
  star: { icon: Star, labelKey: "starredAction", color: "text-yellow-500" },
  share: { icon: Share2, labelKey: "shared", color: "text-purple-500" },
  move: { icon: FolderInput, labelKey: "moved", color: "text-blue-500" },
  copy: { icon: Copy, labelKey: "copied", color: "text-teal-500" },
  create: { icon: FolderPlus, labelKey: "created", color: "text-emerald-500" },
};

function formatTimeAgo(timestamp: number, t: TranslationKeys): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return t.app.justNow;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}${t.app.minAgo}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}${t.app.hrAgo}`;
  const days = Math.floor(hours / 24);
  return `${days}${t.app.dayAgo}`;
}

export function ActivityPanel() {
  const { activities, clearActivities } = useFileStore();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const count = activities.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8" title={t.app.activityLog}>
          <Bell className="w-4 h-4" />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 text-white text-[9px] font-bold flex items-center justify-center">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <h4 className="text-sm font-semibold">{t.app.activityLog}</h4>
          {count > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
              onClick={clearActivities}
            >
              {t.app.clearAll}
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-96">
          {count === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Bell className="w-8 h-8 opacity-30 mb-2" />
              <p className="text-sm">{t.app.noActivityYet}</p>
              <p className="text-xs mt-1">{t.app.actionsWillAppearHere}</p>
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {activities.map((activity) => {
                const config = actionConfig[activity.action];
                const Icon = config.icon;
                return (
                  <div
                    key={activity.id}
                    className="flex items-start gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors"
                  >
                    <div className={cn("mt-0.5", config.color)}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs leading-relaxed">
                        <span className="font-medium">{t.app[config.labelKey]}</span>{" "}
                        <span className="text-muted-foreground truncate">{activity.fileName}</span>
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {formatTimeAgo(activity.timestamp, t)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
