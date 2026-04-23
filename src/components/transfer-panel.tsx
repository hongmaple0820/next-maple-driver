"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFileStore } from "@/store/file-store";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Upload,
  Clock,
  KeyRound,
  Copy,
  Check,
  QrCode,
  Trash2,
  Download,
  File,
  X,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatFileSize, formatRelativeTime } from "@/lib/file-utils";
import { useI18n } from "@/lib/i18n";
import { useSession } from "next-auth/react";
import QRCode from "qrcode";

interface TransferItem {
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
  shareUrl: string;
  isExpired: boolean;
}

interface QrSessionInfo {
  sessionId: string;
  expiresAt: number;
  qrData: string;
}

export function TransferPanel() {
  const { t } = useI18n();
  const { data: sessionData } = useSession();
  const queryClient = useQueryClient();
  const isAuth = !!sessionData?.user;

  // Upload form state
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState("");
  const [expiryOption, setExpiryOption] = useState("24");
  const [maxDownloads, setMaxDownloads] = useState("-1");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload result
  const [uploadResult, setUploadResult] = useState<{
    token: string;
    shareUrl: string;
    fileName: string;
  } | null>(null);
  const [resultQrDataUrl, setResultQrDataUrl] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);

  // QR Upload state
  const [qrSession, setQrSession] = useState<QrSessionInfo | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [showQrUpload, setShowQrUpload] = useState(false);

  // Fetch user's transfer files
  const { data: transfers = [], isLoading: transfersLoading } = useQuery<TransferItem[]>({
    queryKey: ["transfer-list"],
    queryFn: async () => {
      if (!isAuth) return [];
      const res = await fetch("/api/transfer/list");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isAuth,
    refetchInterval: 15000,
  });

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (usePassword && password) {
        formData.append("password", password);
      }
      if (expiryOption && expiryOption !== "0") {
        formData.append("expiresHours", expiryOption);
      }
      formData.append("maxDownloads", maxDownloads);

      const res = await fetch("/api/transfer/upload", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        const fullUrl = `${window.location.origin}${data.shareUrl}`;
        setUploadResult({
          token: data.token,
          shareUrl: fullUrl,
          fileName: data.fileName,
        });
        // Generate QR code for result
        try {
          const qr = await QRCode.toDataURL(fullUrl, {
            width: 200,
            margin: 2,
            color: { dark: "#059669", light: "#ffffff" },
            errorCorrectionLevel: "M",
          });
          setResultQrDataUrl(qr);
        } catch {
          // QR generation failed silently
        }
        toast.success(t.app.transferCreated);
        queryClient.invalidateQueries({ queryKey: ["transfer-list"] });
      } else {
        const data = await res.json();
        toast.error(data.error || "Upload failed");
      }
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  }, [usePassword, password, expiryOption, maxDownloads, t, queryClient]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleUpload(files[0]);
    }
  }, [handleUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleUpload(files[0]);
    }
  }, [handleUpload]);

  const handleCopyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      toast.success(t.app.linkCopied);
    } catch {
      // Clipboard failed
    }
  };

  const handleDeleteTransfer = async (token: string) => {
    try {
      const res = await fetch(`/api/transfer/${token}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(t.app.transferDeleted);
        queryClient.invalidateQueries({ queryKey: ["transfer-list"] });
      }
    } catch {
      toast.error("Delete failed");
    }
  };

  const handleCreateQrSession = async () => {
    try {
      const res = await fetch("/api/transfer/qr-session", {
        method: "POST",
      });
      if (res.ok) {
        const data: QrSessionInfo = await res.json();
        setQrSession(data);
        setShowQrUpload(true);

        // Generate QR code for the upload URL (data.qrData is the full URL)
        const uploadUrl = data.qrData || `${window.location.origin}/transfer-upload?session=${data.sessionId}`;
        try {
          const qr = await QRCode.toDataURL(uploadUrl, {
            width: 256,
            margin: 2,
            color: { dark: "#059669", light: "#ffffff" },
            errorCorrectionLevel: "M",
          });
          setQrDataUrl(qr);
        } catch {
          // QR generation failed silently
        }
      }
    } catch {
      toast.error("Failed to create QR session");
    }
  };

  // Reset form when result is dismissed
  useEffect(() => {
    if (!uploadResult) {
      setResultQrDataUrl("");
      setCopiedLink(false);
    }
  }, [uploadResult]);

  const expiryOptions = isAuth
    ? [
        { value: "0", label: t.app.expiresNever },
        { value: "1", label: t.app.expires1Hour },
        { value: "24", label: t.app.expires1Day },
        { value: "168", label: t.app.expires7Days },
        { value: "720", label: t.app.expires30Days },
      ]
    : [
        { value: "1", label: t.app.expires1Hour },
        { value: "24", label: t.app.expires1Day },
        { value: "168", label: t.app.expires7Days },
      ];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/25">
              <Send className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold">{t.app.quickTransfer}</h2>
              <p className="text-sm text-muted-foreground">{t.app.quickTransferDesc}</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCreateQrSession}
            className="gap-1.5"
          >
            <QrCode className="w-4 h-4" />
            <span className="hidden sm:inline">{t.app.scanToUpload}</span>
          </Button>
        </motion.div>

        {/* Upload Area */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="border-emerald-200/50 dark:border-emerald-800/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="w-4 h-4 text-emerald-600" />
                {t.app.transferUpload}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!uploadResult ? (
                <>
                  {/* Drag & Drop Area */}
                  <div
                    className={`
                      relative flex flex-col items-center justify-center p-8 rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer
                      ${dragOver
                        ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 scale-[1.01]"
                        : "border-muted-foreground/25 hover:border-emerald-400 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/10"
                      }
                    `}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                    <motion.div
                      animate={dragOver ? { scale: 1.1, y: -5 } : { scale: 1, y: 0 }}
                      transition={{ type: "spring", stiffness: 300 }}
                    >
                      <Upload className="w-10 h-10 text-emerald-500 mb-3" />
                    </motion.div>
                    <p className="text-sm font-medium">{t.app.dragDropTransfer}</p>
                    {!isAuth && (
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {t.app.anonymousUploadNote}
                      </p>
                    )}
                    {uploading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-xl">
                        <div className="flex items-center gap-2 text-emerald-600">
                          <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                          <span className="text-sm font-medium">Uploading...</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Options Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* Password */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="flex items-center gap-1.5 text-xs">
                          <KeyRound className="w-3 h-3" />
                          {t.app.setTransferPassword}
                        </Label>
                        <Switch
                          checked={usePassword}
                          onCheckedChange={setUsePassword}
                          className="scale-75"
                        />
                      </div>
                      {usePassword && (
                        <Input
                          type="password"
                          placeholder={t.app.transferPassword}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="h-8 text-sm"
                        />
                      )}
                    </div>

                    {/* Expiry */}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5 text-xs">
                        <Clock className="w-3 h-3" />
                        {t.app.setExpiry}
                      </Label>
                      <Select value={expiryOption} onValueChange={setExpiryOption}>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {expiryOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Max Downloads */}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5 text-xs">
                        <Download className="w-3 h-3" />
                        {t.app.maxDownloads}
                      </Label>
                      <Select value={maxDownloads} onValueChange={setMaxDownloads}>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="-1">{t.app.unlimited}</SelectItem>
                          <SelectItem value="1">1</SelectItem>
                          <SelectItem value="5">5</SelectItem>
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                          <SelectItem value="100">100</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              ) : (
                /* Upload Result */
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-600">
                      <ShieldCheck className="w-5 h-5" />
                      <span className="font-medium">{t.app.transferCreated}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        setUploadResult(null);
                        setUsePassword(false);
                        setPassword("");
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4">
                    {/* QR Code */}
                    {resultQrDataUrl && (
                      <div className="flex flex-col items-center gap-2 p-3 rounded-xl bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/30 dark:to-background border border-emerald-200/50 dark:border-emerald-800/30 shrink-0">
                        <img src={resultQrDataUrl} alt="QR Code" className="w-36 h-36" />
                        <p className="text-[10px] text-muted-foreground">{t.app.scanQrToAccess}</p>
                      </div>
                    )}

                    {/* Link Info */}
                    <div className="flex-1 space-y-3">
                      <div>
                        <p className="text-sm font-medium mb-1">{uploadResult.fileName}</p>
                        <div className="flex gap-2">
                          <Input
                            value={uploadResult.shareUrl}
                            readOnly
                            className="text-sm font-mono h-9"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopyLink(uploadResult.shareUrl)}
                            className="shrink-0 gap-1"
                          >
                            {copiedLink ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </Button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono text-xs">
                          {t.app.transferToken}: {uploadResult.token}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* QR Upload Modal */}
        <AnimatePresence>
          {showQrUpload && qrSession && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <Card className="border-emerald-200/50 dark:border-emerald-800/30">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <QrCode className="w-4 h-4 text-emerald-600" />
                      {t.app.mobileUpload}
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setShowQrUpload(false)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col items-center gap-3 p-4">
                    <p className="text-sm text-muted-foreground text-center">
                      {t.app.scanToUploadDesc}
                    </p>
                    {qrDataUrl && (
                      <div className="p-3 bg-white rounded-lg shadow-sm border border-emerald-100 dark:border-emerald-900/50">
                        <img src={qrDataUrl} alt="Upload QR Code" className="w-52 h-52" />
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {t.app.expires}: {new Date(qrSession.expiresAt).toLocaleTimeString()}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Transfer List (authenticated only) */}
        {isAuth && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <File className="w-4 h-4 text-emerald-600" />
                  {t.app.transferList}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {transfersLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-14 bg-muted/50 rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : transfers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <Send className="w-10 h-10 mb-2 opacity-30" />
                    <p className="text-sm">{t.app.noItemsHere}</p>
                  </div>
                ) : (
                  <ScrollArea className="max-h-96">
                    <div className="space-y-2">
                      {transfers.map((transfer, idx) => (
                        <motion.div
                          key={transfer.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.03 }}
                          className={`flex items-center gap-3 p-3 rounded-lg border transition-colors hover:bg-muted/50 ${
                            transfer.isExpired
                              ? "opacity-50 border-muted"
                              : "border-border/50"
                          }`}
                        >
                          <File className="w-8 h-8 text-emerald-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{transfer.fileName}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-muted-foreground">
                                {formatFileSize(transfer.fileSize)}
                              </span>
                              <span className="text-xs text-muted-foreground">·</span>
                              <span className="text-xs text-muted-foreground">
                                {formatRelativeTime(transfer.createdAt)}
                              </span>
                              {transfer.hasPassword && (
                                <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                                  <KeyRound className="w-2.5 h-2.5 mr-0.5" />
                                  {t.app.transferPassword}
                                </Badge>
                              )}
                              {transfer.isExpired ? (
                                <Badge variant="destructive" className="h-4 px-1 text-[9px]">
                                  {t.app.transferExpired}
                                </Badge>
                              ) : transfer.expiresAt ? (
                                <Badge variant="outline" className="h-4 px-1 text-[9px]">
                                  <Clock className="w-2.5 h-2.5 mr-0.5" />
                                  {formatRelativeTime(transfer.expiresAt)}
                                </Badge>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right">
                              <p className="text-xs font-medium">
                                {transfer.downloadCount}
                                {transfer.maxDownloads > 0 ? `/${transfer.maxDownloads}` : ""}
                              </p>
                              <p className="text-[10px] text-muted-foreground">{t.app.downloads}</p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleCopyLink(`${window.location.origin}${transfer.shareUrl}`)}
                              title={t.app.copyTransferLink}
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => handleDeleteTransfer(transfer.token)}
                              title={t.app.deleteTransfer}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Info note */}
        <p className="text-xs text-center text-muted-foreground/60 pb-4">
          {t.app.transferAutoCleanup}
        </p>
      </div>
    </div>
  );
}
