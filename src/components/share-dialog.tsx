"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useFileStore } from "@/store/file-store";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Share2, Copy, Check, Link, QrCode, Clock, KeyRound, Download } from "lucide-react";
import type { ShareInfo } from "@/lib/file-utils";
import { showActionToast } from "@/lib/undo-toast";
import { useI18n } from "@/lib/i18n";
import QRCode from "qrcode";

export function ShareDialog() {
  const { shareFile, setShareFile, addActivity } = useFileStore();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [useExpiry, setUseExpiry] = useState(false);
  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");
  const [showQrCode, setShowQrCode] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const shareLink = shareInfo
    ? `${window.location.origin}/share/${shareInfo.token}`
    : "";

  // Generate QR code when share link is available and QR is shown
  const generateQrCode = useCallback(async (link: string) => {
    try {
      const dataUrl = await QRCode.toDataURL(link, {
        width: 256,
        margin: 2,
        color: {
          dark: "#059669", // emerald-600
          light: "#ffffff",
        },
        errorCorrectionLevel: "M",
      });
      setQrCodeDataUrl(dataUrl);
    } catch {
      // Fallback: generate on canvas
      try {
        if (canvasRef.current) {
          await QRCode.toCanvas(canvasRef.current, link, {
            width: 256,
            margin: 2,
            color: {
              dark: "#059669",
              light: "#ffffff",
            },
            errorCorrectionLevel: "M",
          });
          setQrCodeDataUrl(canvasRef.current.toDataURL("image/png"));
        }
      } catch {
        // QR generation failed silently
      }
    }
  }, []);

  useEffect(() => {
    if (!shareFile) {
      setShareInfo(null);
      setPassword("");
      setExpiresAt("");
      setUsePassword(false);
      setUseExpiry(false);
      setCopied(false);
      setShowQrCode(false);
      setQrCodeDataUrl("");
    }
  }, [shareFile]);

  // Auto-generate QR when share info is available
  useEffect(() => {
    if (shareInfo && shareLink) {
      generateQrCode(shareLink);
    }
  }, [shareInfo, shareLink, generateQrCode]);

  const handleCreateShare = async () => {
    if (!shareFile) return;
    setLoading(true);
    try {
      const body: Record<string, unknown> = { fileId: shareFile.id };
      if (usePassword && password) body.password = password;
      if (useExpiry && expiresAt) body.expiresAt = new Date(expiresAt).toISOString();

      const res = await fetch("/api/files/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setShareInfo(data);
        queryClient.invalidateQueries({ queryKey: ["files"] });
        addActivity({ action: "share", fileName: shareFile.name });
        const link = `${window.location.origin}/share/${data.token}`;
        showActionToast(
          t.app.shareLinkCreated,
          t.app.copyLink,
          async () => {
            try {
              await navigator.clipboard.writeText(link);
              toast.success("Link copied to clipboard");
            } catch {
              toast.error("Failed to copy link");
            }
          },
        );
      }
    } catch {
      // Error handled silently
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleDownloadQrCode = () => {
    if (!qrCodeDataUrl) return;
    const link = document.createElement("a");
    link.download = `share-qr-${shareInfo?.token || "code"}.png`;
    link.href = qrCodeDataUrl;
    link.click();
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) setShareFile(null);
  };

  return (
    <Dialog open={!!shareFile} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" animation="scale-fade">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-emerald-600" />
            Share File
          </DialogTitle>
          <DialogDescription>
            {t.app.shareDesc} &quot;{shareFile?.name}&quot;
          </DialogDescription>
        </DialogHeader>

        {/* Hidden canvas for QR fallback */}
        <canvas ref={canvasRef} className="hidden" />

        {!shareInfo ? (
          <div className="space-y-4 py-2">
            {/* Password option */}
            <div className="flex items-center justify-between">
              <Label htmlFor="use-password" className="flex items-center gap-2 text-sm">
                <KeyRound className="w-4 h-4 text-muted-foreground" />
                Password protect
              </Label>
              <Switch
                id="use-password"
                checked={usePassword}
                onCheckedChange={setUsePassword}
              />
            </div>
            {usePassword && (
              <Input
                placeholder="Enter password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}

            {/* Expiry option */}
            <div className="flex items-center justify-between">
              <Label htmlFor="use-expiry" className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-muted-foreground" />
                Set expiration
              </Label>
              <Switch
                id="use-expiry"
                checked={useExpiry}
                onCheckedChange={setUseExpiry}
              />
            </div>
            {useExpiry && (
              <Input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            )}
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Share link */}
            <div className="space-y-2">
              <Label>{t.app.shareLink}</Label>
              <div className="flex gap-2">
                <Input value={shareLink} readOnly className="text-sm font-mono" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopy}
                  className="shrink-0"
                  title="Copy link"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  title={t.app.qrCode}
                  onClick={() => setShowQrCode(!showQrCode)}
                >
                  <QrCode className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* QR Code Section */}
            {showQrCode && qrCodeDataUrl && (
              <div className="flex flex-col items-center gap-3 p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/30 dark:to-background border border-emerald-200/50 dark:border-emerald-800/30">
                <p className="text-xs text-muted-foreground font-medium">
                  {t.app.scanQrToAccess}
                </p>
                <div className="p-3 bg-white rounded-lg shadow-sm border border-emerald-100 dark:border-emerald-900/50">
                  { }
                  <img
                    src={qrCodeDataUrl}
                    alt="Share QR Code"
                    className="w-48 h-48"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadQrCode}
                  className="gap-1.5 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                >
                  <Download className="w-3.5 h-3.5" />
                  {t.app.downloadQrCode}
                </Button>
              </div>
            )}

            {/* Share ID */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t.app.shareId}</Label>
              <p className="text-xs font-mono bg-muted p-2 rounded break-all">
                {shareInfo.token}
              </p>
            </div>

            {/* Password display */}
            {shareInfo.password && (
              <div className="space-y-1">
                <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <KeyRound className="w-3 h-3" />
                  {t.app.password}
                </Label>
                <p className="text-sm font-mono bg-muted p-2 rounded">
                  {shareInfo.password}
                </p>
              </div>
            )}

            {/* Expiry display */}
            {shareInfo.expiresAt && (
              <div className="space-y-1">
                <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  {t.app.expires}
                </Label>
                <p className="text-sm">
                  {new Date(shareInfo.expiresAt).toLocaleString()}
                </p>
              </div>
            )}

            {/* Download count */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Link className="w-4 h-4" />
              {shareInfo.downloadCount} {t.app.downloads}
            </div>
          </div>
        )}

        <DialogFooter>
          {!shareInfo ? (
            <>
              <Button variant="outline" onClick={() => setShareFile(null)}>
                {t.app.cancel}
              </Button>
              <Button
                onClick={handleCreateShare}
                disabled={loading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {loading ? t.app.creatingLink : t.app.createLink}
              </Button>
            </>
          ) : (
            <Button onClick={() => setShareFile(null)}>{t.app.done}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
