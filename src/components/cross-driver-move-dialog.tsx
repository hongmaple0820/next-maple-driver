"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HardDrive, ArrowRight, Copy, Move, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useFileStore } from "@/store/file-store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";

interface DriverInfo {
  id: string;
  name: string;
  type: string;
  isDefault: boolean;
  status: string;
}

interface TransferStatus {
  taskId: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  progress: number;
  totalFiles: number;
  processedFiles: number;
  succeededFiles: number;
  failedFiles: number;
  errors: string[];
  duration: number;
}

export function CrossDriverMoveDialog() {
  const { crossDriverMoveOpen, setCrossDriverMoveOpen, crossDriverMoveFileIds } = useFileStore();
  const queryClient = useQueryClient();
  const { t } = useI18n();

  const [selectedDriverId, setSelectedDriverId] = useState<string>("");
  const [mode, setMode] = useState<"copy" | "move">("move");
  const [targetParentId, setTargetParentId] = useState<string>("root");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [transferStatus, setTransferStatus] = useState<TransferStatus | null>(null);

  // Fetch available drivers
  const { data: driversData } = useQuery<{ drivers: DriverInfo[] }>({
    queryKey: ["cross-driver-list"],
    queryFn: async () => {
      const res = await fetch("/api/files/cross-driver-transfer");
      if (!res.ok) throw new Error("Failed to fetch drivers");
      return res.json();
    },
    enabled: crossDriverMoveOpen,
  });

  const drivers = driversData?.drivers || [];

  // Poll transfer status
  useEffect(() => {
    if (!taskId || !crossDriverMoveOpen) return;

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/files/cross-driver-transfer/${taskId}`);
        if (res.ok) {
          const status: TransferStatus = await res.json();
          setTransferStatus(status);

          if (status.status === "completed" || status.status === "failed") {
            clearInterval(pollInterval);
            queryClient.invalidateQueries({ queryKey: ["files"] });
            queryClient.invalidateQueries({ queryKey: ["storage-stats"] });

            if (status.status === "completed") {
              toast.success(t.app.transferComplete);
            } else {
              toast.error(t.app.transferFailed);
            }
          }
        }
      } catch {
        // Polling error, continue
      }
    }, 1000);

    return () => clearInterval(pollInterval);
  }, [taskId, crossDriverMoveOpen, queryClient, t]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!crossDriverMoveOpen) {
      // Use microtask to avoid synchronous setState in effect
      const timer = setTimeout(() => {
        setSelectedDriverId("");
        setMode("move");
        setTargetParentId("root");
        setTaskId(null);
        setTransferStatus(null);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [crossDriverMoveOpen]);

  const isTransferring = transferStatus?.status === "pending" || transferStatus?.status === "in_progress";
  const isComplete = transferStatus?.status === "completed" || transferStatus?.status === "failed";

  const handleStartTransfer = useCallback(async () => {
    if (!selectedDriverId) {
      toast.error(t.app.selectDriver);
      return;
    }

    try {
      const res = await fetch("/api/files/cross-driver-transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileIds: crossDriverMoveFileIds,
          targetDriverId: selectedDriverId,
          targetParentId,
          mode,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setTaskId(data.taskId);
        setTransferStatus({
          taskId: data.taskId,
          status: "pending",
          progress: 0,
          totalFiles: data.totalFiles,
          processedFiles: 0,
          succeededFiles: 0,
          failedFiles: 0,
          errors: [],
          duration: 0,
        });
      } else {
        const error = await res.json().catch(() => ({ error: "Transfer failed" }));
        toast.error(error.error || t.app.transferFailed);
      }
    } catch {
      toast.error(t.app.transferFailed);
    }
  }, [selectedDriverId, crossDriverMoveFileIds, targetParentId, mode, t]);

  const handleClose = useCallback(() => {
    if (isTransferring) return; // Don't close during transfer
    setCrossDriverMoveOpen(false);
  }, [isTransferring, setCrossDriverMoveOpen]);

  const getDriverIcon = (type: string) => {
    switch (type) {
      case "local": return "💾";
      case "s3": return "☁️";
      case "webdav": return "🌐";
      case "mount": return "💿";
      default: return "📀";
    }
  };

  return (
    <Dialog open={crossDriverMoveOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-emerald-600" />
            {t.app.crossDriverTransfer}
          </DialogTitle>
          <DialogDescription>
            {crossDriverMoveFileIds.length} {crossDriverMoveFileIds.length === 1 ? "file" : "files"} selected
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Transfer progress section */}
          {(isTransferring || isComplete) && transferStatus && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{t.app.transferProgress}</span>
                <span className={cn(
                  "font-medium",
                  isComplete && transferStatus.status === "completed" && "text-emerald-600",
                  isComplete && transferStatus.status === "failed" && "text-red-600",
                  isTransferring && "text-amber-600"
                )}>
                  {isTransferring && (
                    <span className="flex items-center gap-1">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {t.app.transferring}
                    </span>
                  )}
                  {isComplete && transferStatus.status === "completed" && (
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {t.app.transferComplete}
                    </span>
                  )}
                  {isComplete && transferStatus.status === "failed" && (
                    <span className="flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5" />
                      {t.app.transferFailed}
                    </span>
                  )}
                </span>
              </div>

              <Progress value={transferStatus.progress} className="h-2" />

              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="bg-muted/50 rounded-md p-2">
                  <div className="font-semibold text-sm">{transferStatus.totalFiles}</div>
                  <div className="text-muted-foreground">Total</div>
                </div>
                <div className="bg-emerald-500/10 rounded-md p-2">
                  <div className="font-semibold text-sm text-emerald-600">{transferStatus.succeededFiles}</div>
                  <div className="text-emerald-600/70">{t.app.filesSucceeded}</div>
                </div>
                <div className="bg-red-500/10 rounded-md p-2">
                  <div className="font-semibold text-sm text-red-600">{transferStatus.failedFiles}</div>
                  <div className="text-red-600/70">{t.app.filesFailed}</div>
                </div>
              </div>

              {transferStatus.errors.length > 0 && (
                <ScrollArea className="max-h-24">
                  <div className="text-xs text-red-500 space-y-0.5">
                    {transferStatus.errors.map((error, i) => (
                      <p key={i}>• {error}</p>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          )}

          {/* Driver selection (hidden during/after transfer) */}
          {!isTransferring && !isComplete && (
            <>
              {/* Target driver selection */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t.app.selectTargetDriver}</Label>
                {drivers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t.app.noDriversAvailable}</p>
                ) : (
                  <RadioGroup value={selectedDriverId} onValueChange={setSelectedDriverId}>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {drivers.map((driver) => (
                        <label
                          key={driver.id}
                          htmlFor={`driver-${driver.id}`}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                            selectedDriverId === driver.id
                              ? "border-emerald-500 bg-emerald-500/5"
                              : "border-border hover:border-emerald-500/30 hover:bg-muted/30"
                          )}
                        >
                          <RadioGroupItem value={driver.id} id={`driver-${driver.id}`} />
                          <span className="text-lg">{getDriverIcon(driver.type)}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm truncate">{driver.name}</span>
                              {driver.isDefault && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-medium">
                                  Default
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground capitalize">{driver.type}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </RadioGroup>
                )}
              </div>

              {/* Transfer mode */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t.app.transferMode}</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMode("move")}
                    className={cn(
                      "flex items-center justify-center gap-2 p-3 rounded-lg border transition-all",
                      mode === "move"
                        ? "border-emerald-500 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                        : "border-border hover:border-emerald-500/30"
                    )}
                  >
                    <Move className="w-4 h-4" />
                    <div className="text-left">
                      <div className="text-sm font-medium">{t.app.moveToDriver}</div>
                      <div className="text-[10px] text-muted-foreground">Remove from source</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("copy")}
                    className={cn(
                      "flex items-center justify-center gap-2 p-3 rounded-lg border transition-all",
                      mode === "copy"
                        ? "border-emerald-500 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                        : "border-border hover:border-emerald-500/30"
                    )}
                  >
                    <Copy className="w-4 h-4" />
                    <div className="text-left">
                      <div className="text-sm font-medium">{t.app.copyToDriver}</div>
                      <div className="text-[10px] text-muted-foreground">Keep in source</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Target folder */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t.app.targetFolder}</Label>
                <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-muted/20">
                  <HardDrive className="w-4 h-4 text-muted-foreground" />
                  <ArrowRight className="w-3 h-3 text-muted-foreground" />
                  <span className="text-sm">{t.app.rootFolder}</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    ({t.app.targetFolder})
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          {!isTransferring && !isComplete && (
            <>
              <Button variant="outline" onClick={handleClose}>
                {t.app.cancelTransfer}
              </Button>
              <Button
                onClick={handleStartTransfer}
                disabled={!selectedDriverId || crossDriverMoveFileIds.length === 0}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {t.app.startTransfer}
              </Button>
            </>
          )}
          {isComplete && (
            <Button onClick={handleClose} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {t.app.close}
            </Button>
          )}
          {isTransferring && (
            <Button variant="outline" disabled>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              {t.app.transferring}...
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
