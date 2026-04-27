"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CloudUpload, CloudDownload, FolderInput, Copy, Zap, Package,
  X, Pause, Play, RotateCcw, Trash2,
  CheckCircle2, AlertCircle, Clock, Loader2, Activity,
  ChevronDown, ChevronUp, ArrowUpDown, XCircle
} from "lucide-react";
import { useTaskStore, type TaskType, type TaskStatus, type Task } from "@/store/task-store";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatFileSize } from "@/lib/file-utils";

// ──────────────────── Helpers ────────────────────

function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond <= 0) return "—";
  return `${formatFileSize(bytesPerSecond)}/s`;
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "—";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function getTaskTypeIcon(type: TaskType) {
  switch (type) {
    case "upload": return CloudUpload;
    case "download": return CloudDownload;
    case "move": return FolderInput;
    case "copy": return Copy;
    case "quick-transfer": return Zap;
    case "transit": return Package;
    default: return CloudUpload;
  }
}

function getTaskTypeColor(type: TaskType): string {
  switch (type) {
    case "upload": return "text-emerald-500";
    case "download": return "text-sky-500";
    case "move": return "text-amber-500";
    case "copy": return "text-teal-500";
    case "quick-transfer": return "text-purple-500";
    case "transit": return "text-orange-500";
    default: return "text-muted-foreground";
  }
}

function getTaskTypeBgColor(type: TaskType): string {
  switch (type) {
    case "upload": return "bg-emerald-500/10";
    case "download": return "bg-sky-500/10";
    case "move": return "bg-amber-500/10";
    case "copy": return "bg-teal-500/10";
    case "quick-transfer": return "bg-purple-500/10";
    case "transit": return "bg-orange-500/10";
    default: return "bg-muted";
  }
}

function getTaskTypeLabel(type: TaskType): string {
  switch (type) {
    case "upload": return "Upload";
    case "download": return "Download";
    case "move": return "Move";
    case "copy": return "Copy";
    case "quick-transfer": return "Quick Transfer";
    case "transit": return "Transit";
    default: return "Task";
  }
}

function getStatusBadge(status: TaskStatus) {
  switch (status) {
    case "pending":
      return { label: "Queued", variant: "secondary" as const, icon: Clock, color: "text-muted-foreground" };
    case "running":
      return { label: "Running", variant: "default" as const, icon: Loader2, color: "text-emerald-600 dark:text-emerald-400" };
    case "paused":
      return { label: "Paused", variant: "secondary" as const, icon: Pause, color: "text-amber-500" };
    case "completed":
      return { label: "Completed", variant: "secondary" as const, icon: CheckCircle2, color: "text-emerald-500" };
    case "failed":
      return { label: "Failed", variant: "destructive" as const, icon: AlertCircle, color: "text-destructive" };
    case "cancelled":
      return { label: "Cancelled", variant: "secondary" as const, icon: XCircle, color: "text-muted-foreground" };
    default:
      return { label: status, variant: "secondary" as const, icon: Clock, color: "text-muted-foreground" };
  }
}

function getProgressColor(status: TaskStatus): string {
  switch (status) {
    case "running": return "[&>div]:bg-emerald-500";
    case "paused": return "[&>div]:bg-amber-500";
    case "completed": return "[&>div]:bg-emerald-500";
    case "failed": return "[&>div]:bg-destructive";
    case "cancelled": return "[&>div]:bg-muted-foreground";
    default: return "";
  }
}

// ──────────────────── Task Item Component ────────────────────

function TaskItem({ task, onToggleExpand, isExpanded }: {
  task: Task;
  onToggleExpand: () => void;
  isExpanded: boolean;
}) {
  const taskStore = useTaskStore();
  const Icon = getTaskTypeIcon(task.type);
  const statusInfo = getStatusBadge(task.status);
  const StatusIcon = statusInfo.icon;
  const isActive = task.status === "running" || task.status === "pending";
  const isCompleted = task.status === "completed";
  const isFailed = task.status === "failed";
  const isCancelled = task.status === "cancelled";

  const elapsed = task.completedAt && task.startedAt
    ? task.completedAt - task.startedAt
    : task.startedAt
    ? Date.now() - task.startedAt
    : 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, height: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn(
        "group border border-border/40 rounded-lg overflow-hidden transition-colors",
        isActive && "bg-emerald-500/[0.02] dark:bg-emerald-500/[0.04] border-emerald-500/20",
        isFailed && "bg-destructive/[0.02] dark:bg-destructive/[0.04] border-destructive/20",
        isCompleted && "bg-muted/30",
        !isActive && !isFailed && !isCompleted && "bg-card hover:bg-accent/30"
      )}
    >
      {/* Main row */}
      <div className="flex items-center gap-3 p-3 cursor-pointer" onClick={onToggleExpand}>
        {/* Type icon */}
        <div className={cn(
          "shrink-0 flex items-center justify-center w-9 h-9 rounded-lg",
          getTaskTypeBgColor(task.type)
        )}>
          <Icon className={cn("w-4.5 h-4.5", getTaskTypeColor(task.type))} />
        </div>

        {/* File info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate">{task.fileName}</p>
            <Badge variant={statusInfo.variant} className={cn(
              "h-5 px-1.5 text-[10px] shrink-0 font-medium",
              statusInfo.color
            )}>
              <StatusIcon className={cn(
                "w-3 h-3 mr-0.5",
                task.status === "running" && "animate-spin"
              )} />
              {statusInfo.label}
            </Badge>
          </div>

          {/* Progress bar */}
          {(isActive || isCompleted) && (
            <div className="flex items-center gap-2 mt-1.5">
              <Progress
                value={task.progress}
                className={cn("h-1.5 flex-1", getProgressColor(task.status))}
              />
              <span className="text-[11px] text-muted-foreground tabular-nums w-8 text-right">
                {task.progress}%
              </span>
            </div>
          )}

          {/* Meta info */}
          <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
            {task.status === "running" && task.speed > 0 && (
              <span className="flex items-center gap-1">
                <Activity className="w-3 h-3" />
                {formatSpeed(task.speed)}
              </span>
            )}
            <span>
              {task.fileSize > 0
                ? `${formatFileSize(Math.round(task.fileSize * task.progress / 100))} / ${formatFileSize(task.fileSize)}`
                : getTaskTypeLabel(task.type)
              }
            </span>
            {task.status === "pending" && task.queuePosition > 0 && (
              <span className="flex items-center gap-1">
                <ArrowUpDown className="w-3 h-3" />
                Queue #{task.queuePosition}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          {task.status === "running" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={(e) => { e.stopPropagation(); taskStore.pauseTask(task.id); }}
                >
                  <Pause className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Pause</TooltipContent>
            </Tooltip>
          )}
          {task.status === "paused" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={(e) => { e.stopPropagation(); taskStore.resumeTask(task.id); }}
                >
                  <Play className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Resume</TooltipContent>
            </Tooltip>
          )}
          {(task.status === "failed" || task.status === "cancelled") && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={(e) => { e.stopPropagation(); taskStore.retryTask(task.id); }}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Retry</TooltipContent>
            </Tooltip>
          )}
          {isActive && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={(e) => { e.stopPropagation(); taskStore.cancelTask(task.id); }}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Cancel</TooltipContent>
            </Tooltip>
          )}
          {(isCompleted || isFailed || isCancelled) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  onClick={(e) => { e.stopPropagation(); taskStore.removeTask(task.id); }}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Remove</TooltipContent>
            </Tooltip>
          )}
          {/* Expand indicator */}
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-muted-foreground"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </motion.div>
        </div>
      </div>

      {/* Expanded details */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-0 border-t border-border/30 space-y-2">
              {/* Task details grid */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-2 text-xs">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="font-medium">Type</span>
                </div>
                <div className="text-right">{getTaskTypeLabel(task.type)}</div>

                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="font-medium">Size</span>
                </div>
                <div className="text-right">{task.fileSize > 0 ? formatFileSize(task.fileSize) : "—"}</div>

                {task.startedAt && (
                  <>
                    <div className="text-muted-foreground font-medium">Duration</div>
                    <div className="text-right">{formatDuration(elapsed)}</div>
                  </>
                )}

                {task.sourcePath && (
                  <>
                    <div className="text-muted-foreground font-medium">Source</div>
                    <div className="text-right truncate max-w-[180px]" title={task.sourcePath}>{task.sourcePath}</div>
                  </>
                )}

                {task.destPath && (
                  <>
                    <div className="text-muted-foreground font-medium">Destination</div>
                    <div className="text-right truncate max-w-[180px]" title={task.destPath}>{task.destPath}</div>
                  </>
                )}

                <div className="text-muted-foreground font-medium">Created</div>
                <div className="text-right">{new Date(task.createdAt).toLocaleTimeString()}</div>

                {task.completedAt && (
                  <>
                    <div className="text-muted-foreground font-medium">Finished</div>
                    <div className="text-right">{new Date(task.completedAt).toLocaleTimeString()}</div>
                  </>
                )}
              </div>

              {/* Chunk progress (for chunked uploads) */}
              {task.totalChunks > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground font-medium">Chunk Progress</span>
                    <span className="text-muted-foreground">{task.uploadedChunks} / {task.totalChunks}</span>
                  </div>
                  <div className="flex gap-0.5 flex-wrap">
                    {task.chunks.map((chunk) => (
                      <div
                        key={chunk.index}
                        className={cn(
                          "w-2.5 h-2.5 rounded-[2px] transition-colors",
                          chunk.status === "done" && "bg-emerald-500",
                          chunk.status === "uploading" && "bg-emerald-400 animate-pulse",
                          chunk.status === "failed" && "bg-destructive",
                          chunk.status === "pending" && "bg-muted-foreground/20"
                        )}
                        title={`Chunk ${chunk.index + 1}: ${chunk.status}${chunk.retries > 0 ? ` (${chunk.retries} retries)` : ""}`}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Error message */}
              {task.error && (
                <div className="flex items-start gap-2 mt-1 p-2 rounded-md bg-destructive/10 text-destructive text-xs">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span className="break-all">{task.error}</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ──────────────────── Task Group Component ────────────────────

function TaskGroup({ label, icon: Icon, color, tasks, expandedIds, toggleExpand }: {
  label: string;
  icon: typeof CloudUpload;
  color: string;
  tasks: Task[];
  expandedIds: Set<string>;
  toggleExpand: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  if (tasks.length === 0) return null;

  return (
    <div className="space-y-2">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 w-full text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 hover:text-muted-foreground transition-colors"
      >
        <Icon className={cn("w-3.5 h-3.5", color)} />
        <span>{label}</span>
        <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{tasks.length}</Badge>
        <motion.div
          animate={{ rotate: collapsed ? -90 : 0 }}
          transition={{ duration: 0.15 }}
          className="ml-auto"
        >
          <ChevronDown className="w-3 h-3" />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden space-y-2"
          >
            <AnimatePresence>
              {tasks.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  isExpanded={expandedIds.has(task.id)}
                  onToggleExpand={() => toggleExpand(task.id)}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ──────────────────── Statistics Bar ────────────────────

function StatisticsBar({ tasks }: { tasks: Task[] }) {
  const runningTasks = tasks.filter(t => t.status === "running");
  const pendingTasks = tasks.filter(t => t.status === "pending");

  const uploadSpeed = runningTasks
    .filter(t => t.type === "upload" || t.type === "quick-transfer")
    .reduce((sum, t) => sum + t.speed, 0);

  const downloadSpeed = runningTasks
    .filter(t => t.type === "download")
    .reduce((sum, t) => sum + t.speed, 0);

  return (
    <div className="grid grid-cols-4 gap-2 p-3 bg-muted/30 rounded-lg border border-border/40">
      <div className="text-center">
        <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground mb-0.5">
          <CloudUpload className="w-3 h-3 text-emerald-500" />
          <span>Upload</span>
        </div>
        <p className="text-xs font-semibold tabular-nums">{formatSpeed(uploadSpeed)}</p>
      </div>
      <div className="text-center">
        <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground mb-0.5">
          <CloudDownload className="w-3 h-3 text-sky-500" />
          <span>Download</span>
        </div>
        <p className="text-xs font-semibold tabular-nums">{formatSpeed(downloadSpeed)}</p>
      </div>
      <div className="text-center">
        <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground mb-0.5">
          <Activity className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
          <span>Active</span>
        </div>
        <p className="text-xs font-semibold tabular-nums">{runningTasks.length}</p>
      </div>
      <div className="text-center">
        <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground mb-0.5">
          <Clock className="w-3 h-3 text-muted-foreground" />
          <span>Queued</span>
        </div>
        <p className="text-xs font-semibold tabular-nums">{pendingTasks.length}</p>
      </div>
    </div>
  );
}

// ──────────────────── Empty State ────────────────────

function EmptyState({ type }: { type: "active" | "completed" | "all" }) {
  const messages = {
    active: { title: "No active tasks", subtitle: "Upload or download files to see progress here" },
    completed: { title: "No completed tasks", subtitle: "Tasks will appear here when finished" },
    all: { title: "No tasks yet", subtitle: "Start uploading or downloading files to track progress" },
  };
  const msg = messages[type];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-16 text-center"
    >
      <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
        <Activity className="w-8 h-8 text-muted-foreground/40" />
      </div>
      <p className="text-sm font-medium text-muted-foreground">{msg.title}</p>
      <p className="text-xs text-muted-foreground/60 mt-1 max-w-[200px]">{msg.subtitle}</p>
    </motion.div>
  );
}

// ──────────────────── Main Component ────────────────────

export function TaskManagerPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("active");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const tasks = useTaskStore((s) => s.tasks);
  const clearCompleted = useTaskStore((s) => s.clearCompleted);
  const clearFailed = useTaskStore((s) => s.clearFailed);

  const activeTasks = useMemo(() =>
    tasks.filter(t => t.status !== "completed" && t.status !== "cancelled"),
    [tasks]
  );
  const completedTasks = useMemo(() =>
    tasks.filter(t => t.status === "completed" || t.status === "cancelled"),
    [tasks]
  );
  const failedTasks = useMemo(() =>
    tasks.filter(t => t.status === "failed"),
    [tasks]
  );

  const activeCount = activeTasks.filter(t => t.status === "running" || t.status === "pending").length;
  const hasActiveRunning = tasks.some(t => t.status === "running");

  // Group active tasks by type
  const activeUploadTasks = useMemo(() =>
    activeTasks.filter(t => t.type === "upload"),
    [activeTasks]
  );
  const activeDownloadTasks = useMemo(() =>
    activeTasks.filter(t => t.type === "download"),
    [activeTasks]
  );
  const activeMoveCopyTasks = useMemo(() =>
    activeTasks.filter(t => t.type === "move" || t.type === "copy"),
    [activeTasks]
  );
  const activeTransferTasks = useMemo(() =>
    activeTasks.filter(t => t.type === "quick-transfer" || t.type === "transit"),
    [activeTasks]
  );

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleClearCompleted = () => {
    clearCompleted();
    clearFailed();
  };

  const completedCount = completedTasks.length + failedTasks.length;

  return (
    <>
      {/* Floating trigger button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="fixed bottom-4 right-4 z-40"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <motion.button
                  onClick={() => setIsOpen(true)}
                  className={cn(
                    "relative flex items-center justify-center w-12 h-12 rounded-full",
                    "bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-lg",
                    "hover:shadow-xl hover:shadow-emerald-500/30 active:scale-95",
                    "transition-shadow duration-200",
                    hasActiveRunning && "shadow-emerald-500/40"
                  )}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {hasActiveRunning ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    >
                      <Loader2 className="w-5 h-5" />
                    </motion.div>
                  ) : (
                    <CloudUpload className="w-5 h-5" />
                  )}

                  {/* Pulse ring when active */}
                  {hasActiveRunning && (
                    <motion.div
                      className="absolute inset-0 rounded-full border-2 border-emerald-400"
                      animate={{ scale: [1, 1.4], opacity: [0.6, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
                    />
                  )}

                  {/* Badge count */}
                  {activeCount > 0 && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-1 -right-1 flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-destructive text-white text-[10px] font-bold shadow-sm"
                    >
                      {activeCount > 99 ? "99+" : activeCount}
                    </motion.div>
                  )}
                </motion.button>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-xs">
                Task Manager{activeCount > 0 ? ` (${activeCount} active)` : ""}
              </TooltipContent>
            </Tooltip>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Slide-in panel */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent
          side="right"
          className="w-full sm:w-[420px] sm:max-w-[420px] p-0 flex flex-col gap-0 bg-background/98 backdrop-blur-xl"
        >
          <SheetTitle className="sr-only">Task Manager</SheetTitle>

          {/* Panel header */}
          <div className="border-b border-border/40 px-4 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/10">
                  <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-base font-bold">Task Manager</h2>
                  <p className="text-[11px] text-muted-foreground">
                    {tasks.length} task{tasks.length !== 1 ? "s" : ""} total
                    {activeCount > 0 && ` · ${activeCount} active`}
                  </p>
                </div>
              </div>
              {completedCount > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground hover:text-destructive"
                      onClick={handleClearCompleted}
                    >
                      <Trash2 className="w-3 h-3 mr-1" />
                      Clear
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">Clear completed & failed</TooltipContent>
                </Tooltip>
              )}
            </div>

            {/* Statistics bar */}
            <StatisticsBar tasks={tasks} />

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="w-full h-8">
                <TabsTrigger value="active" className="text-xs h-6 gap-1">
                  Active
                  {activeCount > 0 && (
                    <Badge variant="secondary" className="h-4 px-1 text-[9px]">{activeCount}</Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="completed" className="text-xs h-6 gap-1">
                  Completed
                  {completedCount > 0 && (
                    <Badge variant="secondary" className="h-4 px-1 text-[9px]">{completedCount}</Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="all" className="text-xs h-6 gap-1">
                  All
                  {tasks.length > 0 && (
                    <Badge variant="secondary" className="h-4 px-1 text-[9px]">{tasks.length}</Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Panel body */}
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              {/* Active tab */}
              {activeTab === "active" && (
                activeTasks.length === 0 ? (
                  <EmptyState type="active" />
                ) : (
                  <div className="space-y-4">
                    <TaskGroup
                      label="Uploads"
                      icon={CloudUpload}
                      color="text-emerald-500"
                      tasks={activeUploadTasks}
                      expandedIds={expandedIds}
                      toggleExpand={toggleExpand}
                    />
                    <TaskGroup
                      label="Downloads"
                      icon={CloudDownload}
                      color="text-sky-500"
                      tasks={activeDownloadTasks}
                      expandedIds={expandedIds}
                      toggleExpand={toggleExpand}
                    />
                    <TaskGroup
                      label="Move / Copy"
                      icon={FolderInput}
                      color="text-amber-500"
                      tasks={activeMoveCopyTasks}
                      expandedIds={expandedIds}
                      toggleExpand={toggleExpand}
                    />
                    <TaskGroup
                      label="Transfers"
                      icon={Zap}
                      color="text-purple-500"
                      tasks={activeTransferTasks}
                      expandedIds={expandedIds}
                      toggleExpand={toggleExpand}
                    />
                  </div>
                )
              )}

              {/* Completed tab */}
              {activeTab === "completed" && (
                completedTasks.length === 0 && failedTasks.length === 0 ? (
                  <EmptyState type="completed" />
                ) : (
                  <div className="space-y-2">
                    <AnimatePresence>
                      {failedTasks.map((task) => (
                        <TaskItem
                          key={task.id}
                          task={task}
                          isExpanded={expandedIds.has(task.id)}
                          onToggleExpand={() => toggleExpand(task.id)}
                        />
                      ))}
                      {completedTasks.map((task) => (
                        <TaskItem
                          key={task.id}
                          task={task}
                          isExpanded={expandedIds.has(task.id)}
                          onToggleExpand={() => toggleExpand(task.id)}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                )
              )}

              {/* All tab */}
              {activeTab === "all" && (
                tasks.length === 0 ? (
                  <EmptyState type="all" />
                ) : (
                  <div className="space-y-2">
                    <AnimatePresence>
                      {tasks.map((task) => (
                        <TaskItem
                          key={task.id}
                          task={task}
                          isExpanded={expandedIds.has(task.id)}
                          onToggleExpand={() => toggleExpand(task.id)}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                )
              )}
            </div>
          </ScrollArea>

          {/* Panel footer - summary */}
          {tasks.length > 0 && (
            <div className="border-t border-border/40 px-4 py-2.5 bg-muted/20">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>
                  {tasks.filter(t => t.status === "running").length} running ·{" "}
                  {tasks.filter(t => t.status === "pending").length} queued ·{" "}
                  {tasks.filter(t => t.status === "completed").length} completed
                  {failedTasks.length > 0 && (
                    <> · <span className="text-destructive">{failedTasks.length} failed</span></>
                  )}
                </span>
                <span>
                  Max concurrent: {useTaskStore.getState().maxConcurrent}
                </span>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
