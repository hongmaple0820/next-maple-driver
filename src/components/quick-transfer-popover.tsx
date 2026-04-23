"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFileStore } from "@/store/file-store";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap,
  Copy,
  Check,
  Clock,
  Folder,
  RefreshCw,
  ExternalLink,
  Loader2,
  Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { useI18n } from "@/lib/i18n";
import QRCode from "qrcode";

interface QuickTransferSession {
  id: string;
  code: string;
  folderId: string | null;
  folderName: string;
  isActive: boolean;
  expiresAt: string;
  createdAt: string;
}

interface RecentTransfer {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  createdAt: string;
}

export function QuickTransferPopover() {
  const { currentFolderId, setSection } = useFileStore();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [countdown, setCountdown] = useState("");
  const [generating, setGenerating] = useState(false);

  // Fetch active sessions
  const { data: sessions = [] } = useQuery<QuickTransferSession[]>({
    queryKey: ["quick-transfer-sessions"],
    queryFn: async () => {
      const res = await fetch("/api/quick-transfer");
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 10000,
  });

  // Find an active session for the current folder
  const activeSession = sessions.find(
    (s) =>
      s.isActive &&
      new Date(s.expiresAt) > new Date() &&
      (s.folderId === currentFolderId || (s.folderId === null && currentFolderId === "root"))
  );

  // Fetch recent transfers to this folder
  const { data: recentTransfers = [] } = useQuery<RecentTransfer[]>({
    queryKey: ["quick-transfer-received", activeSession?.id],
    queryFn: async () => {
      if (!activeSession) return [];
      const res = await fetch(`/api/quick-transfer/${activeSession.code}/files`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!activeSession?.isActive,
    refetchInterval: 5000,
  });

  // Generate code for current folder
  const handleGenerateCode = useCallback(async () => {
    setGenerating(true);
    try {
      const folderId = currentFolderId === "root" ? null : currentFolderId;
      const res = await fetch("/api/quick-transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId }),
      });

      if (res.ok) {
        toast.success(t.app.transferCodeGenerated);
        queryClient.invalidateQueries({ queryKey: ["quick-transfer-sessions"] });
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to generate code");
      }
    } catch {
      toast.error("Failed to generate code");
    } finally {
      setGenerating(false);
    }
  }, [currentFolderId, t, queryClient]);

  // Auto-generate code when popover opens and no active session for this folder
  useEffect(() => {
    if (open && !activeSession && !generating) {
      handleGenerateCode();
    }
  }, [open, activeSession, generating, handleGenerateCode]);

  // Generate QR code for transfer code
  useEffect(() => {
    if (!activeSession?.code) {
      setQrDataUrl("");
      return;
    }
    const transferLink = `${window.location.origin}/?quickTransfer=${activeSession.code}`;
    QRCode.toDataURL(transferLink, {
      width: 120,
      margin: 1,
      color: { dark: "#059669", light: "#ffffff" },
      errorCorrectionLevel: "M",
    }).then(setQrDataUrl).catch(() => {
      // QR generation failed silently
    });
  }, [activeSession?.code]);

  // Live countdown timer
  useEffect(() => {
    if (!activeSession?.expiresAt || !activeSession.isActive || !open) {
      setCountdown("");
      return;
    }

    const updateCountdown = () => {
      const diff = new Date(activeSession.expiresAt).getTime() - Date.now();
      if (diff <= 0) {
        setCountdown(t.app.expired);
        return;
      }
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setCountdown(`${minutes}:${seconds.toString().padStart(2, "0")}`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [activeSession?.expiresAt, activeSession?.isActive, open, t.app.expired]);

  // Copy code
  const handleCopyCode = useCallback(async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
      toast.success(t.app.codeCopied);
    } catch {
      // Clipboard failed
    }
  }, [t]);

  // Open full panel
  const handleOpenFullPanel = () => {
    setOpen(false);
    setSection("quick-transfer");
  };

  // Countdown progress
  const countdownProgress = activeSession?.expiresAt
    ? Math.max(0, Math.min(100, ((new Date(activeSession.expiresAt).getTime() - Date.now()) / (30 * 60 * 1000)) * 100))
    : 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 h-8 text-xs transition-all duration-150 active:scale-95 hover:border-emerald-500/40 hover:text-emerald-700 dark:hover:text-emerald-400 hover:bg-emerald-500/5"
        >
          <Zap className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{t.app.quickTransferToFolder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start" sideOffset={8}>
        <div className="p-4 space-y-3">
          {/* Header */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <h4 className="text-sm font-semibold">{t.app.quickTransferPopoverTitle}</h4>
              <p className="text-[11px] text-muted-foreground">{t.app.quickTransferPopoverDesc}</p>
            </div>
          </div>

          {activeSession ? (
            <>
              {/* Code display */}
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="p-4 rounded-xl bg-gradient-to-r from-emerald-50 to-white dark:from-emerald-950/30 dark:to-background border border-emerald-200/50 dark:border-emerald-800/30 relative"
              >
                {/* Pulsing glow around code */}
                <div className="absolute inset-0 rounded-xl animate-pulse bg-emerald-500/5" />
                <div className="relative flex flex-col items-center gap-3">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-emerald-600/60 dark:text-emerald-400/60">Transfer Code</span>
                  <div className="flex items-center gap-3">
                    <span className="text-3xl font-mono font-bold tracking-[0.3em] text-emerald-700 dark:text-emerald-400">
                      {activeSession.code}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 hover:bg-emerald-500/10"
                      onClick={() => handleCopyCode(activeSession.code)}
                    >
                      {codeCopied ? (
                        <Check className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Copy className="w-4 h-4 text-emerald-600/60" />
                      )}
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 w-full">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    <Progress value={countdownProgress} className="flex-1 h-1.5" />
                    <span className="text-[11px] font-mono text-muted-foreground">{countdown}</span>
                  </div>
                </div>
              </motion.div>

              {/* QR Code and Share via Link */}
              {qrDataUrl && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50">
                  <div className="p-1.5 bg-white rounded-lg border border-emerald-100 dark:border-emerald-900/50 shrink-0 shadow-sm">
                    <img src={qrDataUrl} alt="QR Code" className="w-20 h-20" />
                  </div>
                  <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-muted-foreground">Scan QR code or share link</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 h-7 text-xs w-full hover:border-emerald-500/40 hover:text-emerald-700 dark:hover:text-emerald-400 hover:bg-emerald-500/5"
                      onClick={async () => {
                        const link = `${window.location.origin}/?quickTransfer=${activeSession.code}`;
                        try {
                          await navigator.clipboard.writeText(link);
                          toast.success("Share link copied!");
                        } catch {
                          toast.error("Failed to copy link");
                        }
                      }}
                    >
                      <Link2 className="w-3 h-3" />
                      Share via Link
                    </Button>
                  </div>
                </div>
              )}

              {/* Current folder indicator */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Folder className="w-3 h-3" />
                <span>{currentFolderId === "root" ? t.app.rootFolder : t.app.currentFolder}</span>
              </div>

              {/* Recent transfers to this folder */}
              {recentTransfers.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    {t.app.receivedFiles} ({recentTransfers.length})
                  </p>
                  <div className="max-h-24 overflow-y-auto space-y-0.5">
                    {recentTransfers.slice(0, 3).map((file) => (
                      <div key={file.id} className="flex items-center gap-1.5 text-xs py-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                        <span className="truncate">{file.name}</span>
                      </div>
                    ))}
                    {recentTransfers.length > 3 && (
                      <p className="text-[10px] text-muted-foreground">
                        +{recentTransfers.length - 3} more
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Regenerate + Open Full Panel */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1 h-7 text-xs"
                  onClick={handleGenerateCode}
                  disabled={generating}
                >
                  <RefreshCw className={`w-3 h-3 ${generating ? "animate-spin" : ""}`} />
                  {t.app.regenerateCode}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1 h-7 text-xs"
                  onClick={handleOpenFullPanel}
                >
                  <ExternalLink className="w-3 h-3" />
                  {t.app.openFullPanel}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 py-4">
              {generating ? (
                <>
                  <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
                  <p className="text-xs text-muted-foreground">{t.app.generateCode}</p>
                </>
              ) : (
                <>
                  <Zap className="w-6 h-6 text-emerald-500" />
                  <p className="text-xs text-muted-foreground">{t.app.generateCodeHint}</p>
                  <Button
                    size="sm"
                    className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white h-7 text-xs"
                    onClick={handleGenerateCode}
                    disabled={generating}
                  >
                    <Zap className="w-3 h-3" />
                    {t.app.generateCode}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
