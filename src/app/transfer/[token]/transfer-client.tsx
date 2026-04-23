"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Cloud,
  File,
  Download,
  KeyRound,
  Clock,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatFileSize, formatRelativeTime } from "@/lib/file-utils";
import { useI18n } from "@/lib/i18n";

interface TransferInfo {
  id: string;
  token: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  hasPassword: boolean;
  expiresAt: string | null;
  downloadCount: number;
  maxDownloads: number;
  createdAt: string;
}

type PageState = "loading" | "ready" | "password" | "expired" | "not-found" | "limit-reached";

export default function TransferClient({ token }: { token: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<PageState>("loading");
  const [transferInfo, setTransferInfo] = useState<TransferInfo | null>(null);
  const [password, setPassword] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [passwordError, setPasswordError] = useState(false);

  useEffect(() => {
    async function fetchTransferInfo() {
      try {
        const res = await fetch(`/api/transfer/${token}`);
        if (res.status === 404) {
          setState("not-found");
          return;
        }
        if (res.status === 410) {
          const data = await res.json();
          setState(data.limitReached ? "limit-reached" : "expired");
          return;
        }
        if (!res.ok) {
          setState("not-found");
          return;
        }

        const data: TransferInfo = await res.json();
        setTransferInfo(data);
        setState(data.hasPassword ? "password" : "ready");
      } catch {
        setState("not-found");
      }
    }

    fetchTransferInfo();
  }, [token]);

  const handleDownload = async () => {
    if (!transferInfo) return;
    setDownloading(true);
    setPasswordError(false);

    try {
      const res = await fetch(`/api/transfer/${token}/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: transferInfo.hasPassword ? password : undefined }),
      });

      if (res.status === 403) {
        setPasswordError(true);
        setDownloading(false);
        return;
      }

      if (res.status === 410) {
        try {
          const errData = await res.json();
          setState(errData.limitReached ? "limit-reached" : "expired");
        } catch {
          setState("expired");
        }
        setDownloading(false);
        return;
      }

      if (!res.ok) {
        setDownloading(false);
        return;
      }

      // Download the file
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = transferInfo.fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      // Update download count locally
      setTransferInfo((prev) => prev ? { ...prev, downloadCount: prev.downloadCount + 1 } : prev);
    } catch {
      // Download failed silently
    } finally {
      setDownloading(false);
    }
  };

  const remainingDownloads = transferInfo && transferInfo.maxDownloads > 0
    ? transferInfo.maxDownloads - transferInfo.downloadCount
    : -1;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-sky-50 dark:from-background dark:via-background dark:to-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        {/* Branding */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/25">
            <Cloud className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold bg-gradient-to-r from-emerald-600 to-emerald-800 dark:from-emerald-400 dark:to-emerald-600 bg-clip-text text-transparent">
            CloudDrive
          </span>
        </div>

        {/* Card */}
        <div className="bg-card rounded-2xl shadow-xl border border-border/50 overflow-hidden">
          {state === "loading" && (
            <div className="flex flex-col items-center justify-center py-16 px-6">
              <Loader2 className="w-8 h-8 text-emerald-500 animate-spin mb-4" />
              <p className="text-sm text-muted-foreground">Loading...</p>
            </div>
          )}

          {state === "not-found" && (
            <div className="flex flex-col items-center justify-center py-16 px-6">
              <div className="w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-950/30 flex items-center justify-center mb-4">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <h2 className="text-lg font-semibold mb-1">{t.app.transferNotFound}</h2>
              <p className="text-sm text-muted-foreground">The transfer link may have been deleted.</p>
            </div>
          )}

          {state === "expired" && (
            <div className="flex flex-col items-center justify-center py-16 px-6">
              <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-950/30 flex items-center justify-center mb-4">
                <Clock className="w-8 h-8 text-amber-500" />
              </div>
              <h2 className="text-lg font-semibold mb-1">{t.app.transferExpiredDesc}</h2>
              <p className="text-sm text-muted-foreground">{t.app.transferAutoCleanup}</p>
            </div>
          )}

          {state === "limit-reached" && (
            <div className="flex flex-col items-center justify-center py-16 px-6">
              <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-950/30 flex items-center justify-center mb-4">
                <Download className="w-8 h-8 text-amber-500" />
              </div>
              <h2 className="text-lg font-semibold mb-1">{t.app.downloadLimitReached}</h2>
              <p className="text-sm text-muted-foreground">{t.app.downloadsRemaining}: 0</p>
            </div>
          )}

          {state === "password" && (
            <div className="flex flex-col items-center py-10 px-6">
              <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-950/30 flex items-center justify-center mb-4">
                <KeyRound className="w-7 h-7 text-emerald-600" />
              </div>
              <h2 className="text-lg font-semibold mb-1">{t.app.enterPasswordToDownload}</h2>
              {transferInfo && (
                <p className="text-sm text-muted-foreground mb-4">{transferInfo.fileName}</p>
              )}
              <div className="w-full space-y-3">
                <Input
                  type="password"
                  placeholder={t.app.transferPassword}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setPasswordError(false); }}
                  onKeyDown={(e) => e.key === "Enter" && handleDownload()}
                  className={passwordError ? "border-red-500" : ""}
                />
                {passwordError && (
                  <p className="text-xs text-red-500">{t.app.enterPasswordToDownload}</p>
                )}
                <Button
                  onClick={handleDownload}
                  disabled={!password || downloading}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {downloading ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  {t.app.downloadFile}
                </Button>
              </div>
            </div>
          )}

          {state === "ready" && transferInfo && (
            <div className="flex flex-col items-center py-10 px-6">
              <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-950/30 flex items-center justify-center mb-4">
                <File className="w-7 h-7 text-emerald-600" />
              </div>
              <h2 className="text-lg font-semibold mb-1 break-all text-center">{transferInfo.fileName}</h2>

              {/* File Info */}
              <div className="w-full space-y-2 mt-4 mb-6">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t.app.fileSize}</span>
                  <span className="font-medium">{formatFileSize(transferInfo.fileSize)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t.app.uploadTime}</span>
                  <span className="font-medium">{formatRelativeTime(transferInfo.createdAt)}</span>
                </div>
                {transferInfo.expiresAt && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t.app.expires}</span>
                    <span className="font-medium">{formatRelativeTime(transferInfo.expiresAt)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t.app.download}</span>
                  <span className="font-medium">
                    {transferInfo.downloadCount}
                    {transferInfo.maxDownloads > 0 ? `/${transferInfo.maxDownloads}` : ""}
                  </span>
                </div>
                {remainingDownloads > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t.app.remainingDownloads}</span>
                    <span className="font-medium text-emerald-600">{remainingDownloads}</span>
                  </div>
                )}
              </div>

              <Button
                onClick={handleDownload}
                disabled={downloading || (transferInfo.maxDownloads > 0 && transferInfo.downloadCount >= transferInfo.maxDownloads)}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {downloading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                {t.app.downloadFile}
              </Button>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground/50 mt-6">
          Powered by CloudDrive · {t.app.transferAutoCleanup}
        </p>
      </motion.div>
    </div>
  );
}
