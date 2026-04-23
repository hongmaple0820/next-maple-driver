"use client";

import { useState, useCallback, useRef, useEffect, Suspense } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useFileStore } from "@/store/file-store";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap,
  Send,
  Download,
  Copy,
  Check,
  File,
  Folder,
  X,
  RefreshCw,
  ArrowRight,
  Clock,
  Radio,
  Link2,
  QrCode,
  Image,
  Film,
  Music,
  FileText,
  FileCode,
  Archive,
  Table2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { formatFileSize } from "@/lib/file-utils";
import { useI18n } from "@/lib/i18n";
import { useSession } from "next-auth/react";
import QRCode from "qrcode";

interface QuickTransferSession {
  id: string;
  code: string;
  folderId: string | null;
  isActive: boolean;
  expiresAt: string;
  createdAt: string;
}

interface CodeInfo {
  code: string;
  isActive: boolean;
  isExpired: boolean;
  recipientName: string;
  expiresAt?: string;
}

interface ReceivedFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  createdAt: string;
}

// File type icon helper - returns icon component and color based on file extension/mime
function getFileTypeIcon(fileName: string, mimeType?: string) {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const mime = mimeType?.toLowerCase() || "";

  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"].includes(ext)) {
    return { icon: Image, color: "text-emerald-500" };
  }
  if (mime.startsWith("video/") || ["mp4", "webm", "avi", "mov", "mkv", "flv"].includes(ext)) {
    return { icon: Film, color: "text-rose-500" };
  }
  if (mime.startsWith("audio/") || ["mp3", "wav", "ogg", "flac", "aac", "m4a"].includes(ext)) {
    return { icon: Music, color: "text-purple-500" };
  }
  if (mime === "application/pdf" || ext === "pdf") {
    return { icon: FileText, color: "text-red-500" };
  }
  if (mime.includes("spreadsheet") || ["xls", "xlsx", "csv"].includes(ext)) {
    return { icon: Table2, color: "text-emerald-600" };
  }
  if (["js", "ts", "tsx", "jsx", "py", "rb", "go", "rs", "java", "html", "css", "json", "md"].includes(ext)) {
    return { icon: FileCode, color: "text-sky-500" };
  }
  if (["zip", "rar", "tar", "gz", "7z"].includes(ext)) {
    return { icon: Archive, color: "text-orange-500" };
  }
  if (mime.includes("document") || ["doc", "docx", "txt", "rtf"].includes(ext)) {
    return { icon: FileText, color: "text-blue-500" };
  }
  return { icon: File, color: "text-emerald-500" };
}

export function QuickTransferPanel() {
  return (
    <Suspense fallback={<div className="flex-1 overflow-y-auto"><div className="max-w-3xl mx-auto p-4 sm:p-6"><div className="animate-pulse space-y-4"><div className="h-10 bg-muted rounded" /><div className="h-64 bg-muted rounded" /></div></div></div>}>
      <QuickTransferPanelInner />
    </Suspense>
  );
}

function QuickTransferPanelInner() {
  const { t } = useI18n();
  const { data: sessionData } = useSession();
  const queryClient = useQueryClient();
  const { currentFolderId } = useFileStore();
  const searchParams = useSearchParams();
  const quickTransferCode = searchParams.get("quickTransfer");

  // Active tab
  const [activeTab, setActiveTab] = useState("receive");

  // Receive tab state - generate code
  const [activeSession, setActiveSession] = useState<QuickTransferSession | null>(null);
  const [generating, setGenerating] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [countdown, setCountdown] = useState("");
  const [codeGenerated, setCodeGenerated] = useState(false);

  // Received files
  const [receivedFiles, setReceivedFiles] = useState<ReceivedFile[]>([]);

  // Send tab state - enter code and send files
  const [recipientCode, setRecipientCode] = useState("");
  const [codeInfo, setCodeInfo] = useState<CodeInfo | null>(null);
  const [checkingCode, setCheckingCode] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [sendDragOver, setSendDragOver] = useState(false);
  const sendFileInputRef = useRef<HTMLInputElement>(null);
  const sendFolderInputRef = useRef<HTMLInputElement>(null);
  const autoCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch active sessions
  const { data: sessions = [], isLoading: sessionsLoading } = useQuery<QuickTransferSession[]>({
    queryKey: ["quick-transfer-sessions"],
    queryFn: async () => {
      const res = await fetch("/api/quick-transfer");
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 10000,
  });

  // Fetch received files for active session
  const { data: fetchedReceivedFiles = [] } = useQuery<ReceivedFile[]>({
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

  // Update received files from query
  useEffect(() => {
    if (fetchedReceivedFiles.length > 0) {
      setReceivedFiles(fetchedReceivedFiles);
    }
  }, [fetchedReceivedFiles]);

  // Set active session from fetched sessions
  useEffect(() => {
    if (sessions.length > 0) {
      setActiveSession(sessions[0]);
    }
  }, [sessions]);

  // Handle quickTransfer query param - auto-switch to send tab and pre-fill code
  useEffect(() => {
    if (quickTransferCode && quickTransferCode.length === 6) {
      setActiveTab("send");
      setRecipientCode(quickTransferCode.toUpperCase());
      // Auto-check the code after a short delay
      const timer = setTimeout(async () => {
        setCheckingCode(true);
        try {
          const res = await fetch(`/api/quick-transfer/${quickTransferCode.toUpperCase()}`);
          if (res.ok) {
            const data: CodeInfo = await res.json();
            setCodeInfo(data);
          } else {
            setCodeInfo({ code: quickTransferCode.toUpperCase(), isActive: false, isExpired: true, recipientName: "" });
            toast.error(t.app.invalidTransferCode);
          }
        } catch {
          toast.error("Failed to check code");
        } finally {
          setCheckingCode(false);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [quickTransferCode, t.app.invalidTransferCode]);

  // Live countdown timer
  useEffect(() => {
    if (!activeSession?.expiresAt || !activeSession.isActive) {
      setCountdown("");
      return;
    }

    const updateCountdown = () => {
      const diff = new Date(activeSession.expiresAt).getTime() - Date.now();
      if (diff <= 0) {
        setCountdown(t.app.expired);
        setActiveSession((prev) => prev ? { ...prev, isActive: false } : null);
        return;
      }
      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      if (hours > 0) {
        setCountdown(`${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`);
      } else {
        setCountdown(`${minutes}:${seconds.toString().padStart(2, "0")}`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [activeSession?.expiresAt, activeSession?.isActive, t.app.expired]);

  // Generate QR code for transfer code
  useEffect(() => {
    if (!activeSession?.code) {
      setQrDataUrl("");
      return;
    }
    const transferLink = `${window.location.origin}/?quickTransfer=${activeSession.code}`;
    QRCode.toDataURL(transferLink, {
      width: 160,
      margin: 2,
      color: { dark: "#059669", light: "#ffffff" },
      errorCorrectionLevel: "M",
    }).then(setQrDataUrl).catch(() => {
      // QR generation failed silently
    });
  }, [activeSession?.code]);

  // Generate code
  const handleGenerateCode = useCallback(async () => {
    setGenerating(true);
    setCodeGenerated(false);
    try {
      const folderId = currentFolderId === "root" ? null : currentFolderId;
      const res = await fetch("/api/quick-transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId }),
      });

      if (res.ok) {
        const data: QuickTransferSession = await res.json();
        setActiveSession(data);
        setCodeGenerated(true);
        setReceivedFiles([]);
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

  // Copy link
  const handleCopyLink = useCallback(async (code: string) => {
    try {
      const link = `${window.location.origin}/?quickTransfer=${code}`;
      await navigator.clipboard.writeText(link);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
      toast.success(t.app.linkCopied);
    } catch {
      // Clipboard failed
    }
  }, [t]);

  // Auto-check code when 6 characters entered
  const handleCodeChange = useCallback((value: string) => {
    const upper = value.toUpperCase();
    setRecipientCode(upper);
    setCodeInfo(null);

    if (autoCheckTimerRef.current) {
      clearTimeout(autoCheckTimerRef.current);
    }

    if (upper.length === 6) {
      autoCheckTimerRef.current = setTimeout(async () => {
        setCheckingCode(true);
        setCodeInfo(null);
        try {
          const res = await fetch(`/api/quick-transfer/${upper}`);
          if (res.ok) {
            const data: CodeInfo = await res.json();
            setCodeInfo(data);
          } else {
            setCodeInfo({ code: upper, isActive: false, isExpired: true, recipientName: "" });
            toast.error(t.app.invalidTransferCode);
          }
        } catch {
          toast.error("Failed to check code");
        } finally {
          setCheckingCode(false);
        }
      }, 300);
    }
  }, [t]);

  // Manual check code (for button click or enter key)
  const handleCheckCode = useCallback(async () => {
    if (!recipientCode.trim() || recipientCode.trim().length < 6) return;
    setCheckingCode(true);
    setCodeInfo(null);
    try {
      const res = await fetch(`/api/quick-transfer/${recipientCode.trim().toUpperCase()}`);
      if (res.ok) {
        const data: CodeInfo = await res.json();
        setCodeInfo(data);
      } else {
        setCodeInfo({ code: recipientCode.trim().toUpperCase(), isActive: false, isExpired: true, recipientName: "" });
        toast.error(t.app.invalidTransferCode);
      }
    } catch {
      toast.error("Failed to check code");
    } finally {
      setCheckingCode(false);
    }
  }, [recipientCode, t]);

  // Select files for sending
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      setSelectedFiles((prev) => [...prev, ...Array.from(files)]);
    }
    e.target.value = "";
  }, []);

  // Drag & drop handler for Send tab
  const handleSendDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setSendDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setSelectedFiles((prev) => [...prev, ...files]);
    }
  }, []);

  // Remove selected file
  const handleRemoveFile = useCallback((index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Send files to recipient code
  const handleSendFiles = useCallback(async () => {
    if (!recipientCode.trim() || selectedFiles.length === 0) return;
    setSending(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      selectedFiles.forEach((file, index) => {
        formData.append(`file-${index}`, file);
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || "";
        formData.append(`folderPath-${index}`, relativePath.substring(0, relativePath.lastIndexOf("/")) || "");
      });

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api/quick-transfer/${recipientCode.trim().toUpperCase()}`);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            setUploadProgress(percent);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            try {
              const data = JSON.parse(xhr.responseText);
              reject(new Error(data.error || "Send failed"));
            } catch {
              reject(new Error("Send failed"));
            }
          }
        };

        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(formData);
      });

      toast.success(`${selectedFiles.length} ${t.app.filesSent}`);
      setSelectedFiles([]);
      setCodeInfo(null);
      setRecipientCode("");
      setUploadProgress(0);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to send files";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  }, [recipientCode, selectedFiles, t]);

  const totalSelectedSize = selectedFiles.reduce((sum, f) => sum + f.size, 0);

  // Countdown progress bar (30 min = 1800 seconds)
  const countdownProgress = activeSession?.expiresAt
    ? Math.max(0, Math.min(100, ((new Date(activeSession.expiresAt).getTime() - Date.now()) / (30 * 60 * 1000)) * 100))
    : 0;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/25">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold">{t.app.quickTransfer}</h2>
            <p className="text-sm text-muted-foreground">{t.app.quickTransferDesc}</p>
          </div>
        </motion.div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="receive" className="gap-1.5">
              <Radio className="w-4 h-4" />
              {t.app.receiveFiles}
            </TabsTrigger>
            <TabsTrigger value="send" className="gap-1.5">
              <Send className="w-4 h-4" />
              {t.app.sendFiles}
            </TabsTrigger>
          </TabsList>

          {/* Receive Tab */}
          <TabsContent value="receive">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Card className="border-emerald-200/50 dark:border-emerald-800/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Radio className="w-4 h-4 text-emerald-600" />
                    {t.app.sendToThisDevice}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {sessionsLoading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-32 w-full rounded-xl" />
                      <Skeleton className="h-8 w-3/4 rounded-lg" />
                    </div>
                  ) : activeSession && activeSession.isActive && new Date(activeSession.expiresAt) > new Date() ? (
                    <div className="space-y-4">
                      {/* Show active code with animation */}
                      <motion.div
                        key={activeSession.code}
                        initial={codeGenerated ? { scale: 0.9, opacity: 0 } : false}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 300, damping: 20 }}
                        className="flex flex-col sm:flex-row items-center gap-4 p-6 rounded-xl bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/30 dark:to-background border border-emerald-200/50 dark:border-emerald-800/30"
                      >
                        {/* Code Section */}
                        <div className="flex flex-col items-center gap-2 flex-1">
                          <p className="text-sm text-muted-foreground">{t.app.yourTransferCode}</p>
                          <div className="flex items-center gap-3">
                            <span className="text-3xl sm:text-4xl font-mono font-bold tracking-[0.3em] text-emerald-700 dark:text-emerald-400">
                              {activeSession.code}
                            </span>
                            <div className="flex gap-1">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                onClick={() => handleCopyCode(activeSession.code)}
                                title={t.app.copyCode}
                              >
                                {codeCopied ? (
                                  <Check className="w-4 h-4 text-emerald-600" />
                                ) : (
                                  <Copy className="w-4 h-4" />
                                )}
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                onClick={() => handleCopyLink(activeSession.code)}
                                title={t.app.copyLink}
                              >
                                {linkCopied ? (
                                  <Check className="w-4 h-4 text-emerald-600" />
                                ) : (
                                  <Link2 className="w-4 h-4" />
                                )}
                              </Button>
                            </div>
                          </div>
                          {/* Live Countdown */}
                          <div className="flex items-center gap-2 w-full max-w-xs">
                            <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <Progress value={countdownProgress} className="flex-1 h-1.5" />
                            <span className={`text-sm font-mono tabular-nums ${countdownProgress < 20 ? "text-amber-500" : "text-muted-foreground"}`}>
                              {countdown}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Folder className="w-3 h-3" />
                            <span>
                              {currentFolderId === "root"
                                ? t.app.rootFolder
                                : t.app.currentFolder}
                            </span>
                          </div>
                        </div>

                        {/* QR Code Section */}
                        {qrDataUrl && (
                          <div className="flex flex-col items-center gap-1.5 shrink-0">
                            <div className="p-2 bg-white rounded-lg border border-emerald-100 dark:border-emerald-900/50">
                              <img src={qrDataUrl} alt="QR Code" className="w-28 h-28 sm:w-32 sm:h-32" />
                            </div>
                            <span className="text-[10px] text-muted-foreground">{t.app.scanQrToSend}</span>
                          </div>
                        )}
                      </motion.div>

                      {/* Received Files List */}
                      <AnimatePresence>
                        {receivedFiles.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-sm font-medium">
                                <Download className="w-4 h-4 text-emerald-600" />
                                {t.app.receivedFiles} ({receivedFiles.length})
                              </div>
                              <ScrollArea className="max-h-48">
                                <div className="space-y-1">
                                  {receivedFiles.map((file, idx) => {
                                    const { icon: FileIcon, color } = getFileTypeIcon(file.name, file.mimeType);
                                    return (
                                      <motion.div
                                        key={file.id}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: idx * 0.05 }}
                                        className="flex items-center gap-2 p-2 rounded-lg border border-border/50 text-sm"
                                      >
                                        <FileIcon className={`w-4 h-4 ${color} shrink-0`} />
                                        <span className="flex-1 min-w-0 truncate">{file.name}</span>
                                        <span className="text-xs text-muted-foreground shrink-0">
                                          {formatFileSize(file.size)}
                                        </span>
                                        <Badge variant="secondary" className="h-5 px-1.5 text-[10px] shrink-0 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                                          {t.app.received}
                                        </Badge>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6 shrink-0"
                                          onClick={() => {
                                            const a = document.createElement("a");
                                            a.href = `/api/files/download?id=${file.id}`;
                                            a.download = file.name;
                                            a.click();
                                          }}
                                          title={t.app.download || "Download"}
                                        >
                                          <Download className="w-3.5 h-3.5" />
                                        </Button>
                                      </motion.div>
                                    );
                                  })}
                                </div>
                              </ScrollArea>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Instructions */}
                      <div className="text-sm text-muted-foreground text-center space-y-1">
                        <p>{t.app.quickTransferInstructions}</p>
                      </div>

                      {/* Generate new code button */}
                      <Button
                        variant="outline"
                        className="w-full gap-1.5"
                        onClick={handleGenerateCode}
                        disabled={generating}
                      >
                        <RefreshCw className={`w-4 h-4 ${generating ? "animate-spin" : ""}`} />
                        {t.app.regenerateCode}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* No active code - generate one */}
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col items-center gap-4 p-8 rounded-xl border-2 border-dashed border-muted-foreground/25"
                      >
                        <motion.div
                          animate={{ y: [0, -8, 0] }}
                          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                        >
                          <Zap className="w-12 h-12 text-emerald-500" />
                        </motion.div>
                        <div className="text-center space-y-1">
                          <p className="text-sm font-medium">{t.app.noActiveTransfers}</p>
                          <p className="text-xs text-muted-foreground">{t.app.generateCodeHint}</p>
                        </div>
                        <Button
                          className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                          onClick={handleGenerateCode}
                          disabled={generating}
                        >
                          {generating ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <Zap className="w-4 h-4" />
                          )}
                          {t.app.generateCode}
                        </Button>
                      </motion.div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>

          {/* Send Tab */}
          <TabsContent value="send">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Card className="border-emerald-200/50 dark:border-emerald-800/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Send className="w-4 h-4 text-emerald-600" />
                    {t.app.sendToOtherDevice}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Enter recipient code */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t.app.enterRecipientCode}</label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          value={recipientCode}
                          onChange={(e) => handleCodeChange(e.target.value)}
                          placeholder={t.app.transferCodePlaceholder}
                          className="font-mono text-lg tracking-[0.2em] text-center uppercase pr-8"
                          maxLength={6}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleCheckCode();
                          }}
                        />
                        {checkingCode && (
                          <div className="absolute right-2 top-1/2 -translate-y-1/2">
                            <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <Button
                        onClick={handleCheckCode}
                        disabled={checkingCode || recipientCode.length < 6}
                        className="shrink-0 gap-1"
                      >
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </div>
                    {recipientCode.length > 0 && recipientCode.length < 6 && (
                      <p className="text-xs text-muted-foreground">{t.app.autoCheckHint}</p>
                    )}
                  </div>

                  {/* Code info result */}
                  <AnimatePresence>
                    {codeInfo && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        {codeInfo.isActive && !codeInfo.isExpired ? (
                          <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-800/30">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-sm">
                              {t.app.sendingTo} <strong>{codeInfo.recipientName}</strong>
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                            <X className="w-4 h-4 text-destructive" />
                            <span className="text-sm text-destructive">{t.app.invalidOrExpiredCode}</span>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Drag & Drop + File selection area */}
                  {codeInfo && codeInfo.isActive && !codeInfo.isExpired && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="space-y-3"
                    >
                      {/* Drag and drop area */}
                      <div
                        className={`
                          relative flex flex-col items-center justify-center p-6 rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer
                          ${sendDragOver
                            ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 scale-[1.01]"
                            : "border-muted-foreground/25 hover:border-emerald-400 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/10"
                          }
                        `}
                        onDragOver={(e) => { e.preventDefault(); setSendDragOver(true); }}
                        onDragLeave={() => setSendDragOver(false)}
                        onDrop={handleSendDrop}
                        onClick={() => sendFileInputRef.current?.click()}
                      >
                        <motion.div
                          animate={sendDragOver ? { scale: 1.1, y: -5 } : { scale: 1, y: 0 }}
                          transition={{ type: "spring", stiffness: 300 }}
                        >
                          <Upload className="w-8 h-8 text-emerald-500 mb-2" />
                        </motion.div>
                        <p className="text-sm font-medium">{t.app.dropFilesToSend}</p>
                        <p className="text-xs text-muted-foreground mt-1">{t.app.orSelectFiles}</p>
                        <input
                          ref={sendFileInputRef}
                          type="file"
                          multiple
                          className="hidden"
                          onChange={handleFileSelect}
                        />
                        <input
                          ref={sendFolderInputRef}
                          type="file"
                          multiple
                          className="hidden"
                          onChange={handleFileSelect}
                          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
                        />
                      </div>

                      {/* File/Folder buttons */}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="flex-1 gap-1.5"
                          onClick={(e) => { e.stopPropagation(); sendFileInputRef.current?.click(); }}
                          disabled={sending}
                        >
                          <File className="w-4 h-4" />
                          {t.app.selectFiles}
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1 gap-1.5"
                          onClick={(e) => { e.stopPropagation(); sendFolderInputRef.current?.click(); }}
                          disabled={sending}
                        >
                          <Folder className="w-4 h-4" />
                          {t.app.selectFolder}
                        </Button>
                      </div>

                      {/* Selected files list with file type icons */}
                      {selectedFiles.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                              {selectedFiles.length} {t.app.items}
                            </span>
                            <span className="text-muted-foreground">
                              {formatFileSize(totalSelectedSize)}
                            </span>
                          </div>
                          <ScrollArea className="max-h-48">
                            <div className="space-y-1">
                              {selectedFiles.map((file, idx) => {
                                const { icon: FileIcon, color } = getFileTypeIcon(file.name, file.type);
                                return (
                                  <motion.div
                                    key={`${file.name}-${idx}`}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: idx * 0.03 }}
                                    className="flex items-center gap-2 p-2 rounded-lg border border-border/50 text-sm"
                                  >
                                    {(file as File & { webkitRelativePath?: string }).webkitRelativePath ? (
                                      <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                                    ) : (
                                      <FileIcon className={`w-4 h-4 ${color} shrink-0`} />
                                    )}
                                    <span className="flex-1 min-w-0 truncate">
                                      {(file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name}
                                    </span>
                                    <span className="text-xs text-muted-foreground shrink-0">
                                      {formatFileSize(file.size)}
                                    </span>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 shrink-0"
                                      onClick={() => handleRemoveFile(idx)}
                                      disabled={sending}
                                    >
                                      <X className="w-3 h-3" />
                                    </Button>
                                  </motion.div>
                                );
                              })}
                            </div>
                          </ScrollArea>

                          {/* Upload progress */}
                          {sending && (
                            <div className="space-y-1">
                              <Progress value={uploadProgress} className="h-2" />
                              <p className="text-xs text-center text-muted-foreground">
                                {t.app.sending}... {uploadProgress}%
                              </p>
                            </div>
                          )}

                          {/* Send button */}
                          <Button
                            className="w-full gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                            onClick={handleSendFiles}
                            disabled={sending || selectedFiles.length === 0}
                          >
                            {sending ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <Send className="w-4 h-4" />
                            )}
                            {sending ? t.app.sending : t.app.sendFiles}
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full text-destructive hover:text-destructive"
                            onClick={() => setSelectedFiles([])}
                            disabled={sending}
                          >
                            {t.app.clearSelection}
                          </Button>
                        </div>
                      )}
                    </motion.div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>
        </Tabs>

        {/* Info note */}
        <p className="text-xs text-center text-muted-foreground/60 pb-4">
          {t.app.quickTransferNote}
        </p>
      </div>
    </div>
  );
}
