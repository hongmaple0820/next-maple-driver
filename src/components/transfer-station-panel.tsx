"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFileStore } from "@/store/file-store";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Package,
  Upload,
  Clock,
  KeyRound,
  Copy,
  Check,
  QrCode,
  Trash2,
  Download,
  File,
  Folder,
  X,
  ShieldCheck,
  AlertCircle,
  FolderOpen,
  Shield,
  Timer,
  Search,
  ArrowUpDown,
  Image,
  Film,
  Music,
  FileText,
  FileCode,
  Archive,
  Table2,
  CheckSquare,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { formatFileSize, formatRelativeTime } from "@/lib/file-utils";
import { cn } from "@/lib/utils";
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
  isFolder?: boolean;
  storagePath?: string;
}

interface QrSessionInfo {
  sessionId: string;
  expiresAt: number;
  qrData: string;
}

type SortField = "name" | "date" | "size" | "expiry";
type SortDirection = "asc" | "desc";

// File type icon helper
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
  return { icon: File, color: "text-amber-500" };
}

// Check if file is image for thumbnail
function isImageFile(fileName: string, mimeType?: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const mime = mimeType?.toLowerCase() || "";
  return mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(ext);
}

export function TransferStationPanel() {
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
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Selected files for multi-file upload
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [totalSelectedSize, setTotalSelectedSize] = useState(0);

  // Upload result
  const [uploadResults, setUploadResults] = useState<{
    token: string;
    shareUrl: string;
    fileName: string;
  }[]>([]);
  const [resultQrDataUrl, setResultQrDataUrl] = useState("");
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  // QR Upload state
  const [qrSession, setQrSession] = useState<QrSessionInfo | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [showQrUpload, setShowQrUpload] = useState(false);

  // Transfer list state
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);

  // Active uploads with per-file progress
  const [activeUploads, setActiveUploads] = useState<{
    id: string;
    fileName: string;
    progress: number;
    status: "uploading" | "done" | "error";
  }[]>([]);

  // Capacity limits
  const ANON_MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
  const AUTH_MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
  const maxFileSize = isAuth ? AUTH_MAX_FILE_SIZE : ANON_MAX_FILE_SIZE;
  const maxExpiryDays = isAuth ? 30 : 7;

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

  // Update total size when files change
  useEffect(() => {
    const total = selectedFiles.reduce((sum, f) => sum + f.size, 0);
    setTotalSelectedSize(total);
  }, [selectedFiles]);

  // Filter and sort transfers
  const filteredAndSortedTransfers = useMemo(() => {
    let result = [...transfers];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(t =>
        t.fileName.toLowerCase().includes(query) ||
        t.token.toLowerCase().includes(query)
      );
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = a.fileName.localeCompare(b.fileName);
          break;
        case "date":
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case "size":
          cmp = a.fileSize - b.fileSize;
          break;
        case "expiry":
          const aExpiry = a.expiresAt ? new Date(a.expiresAt).getTime() : Infinity;
          const bExpiry = b.expiresAt ? new Date(b.expiresAt).getTime() : Infinity;
          cmp = aExpiry - bExpiry;
          break;
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });

    return result;
  }, [transfers, searchQuery, sortField, sortDirection]);

  // Quick upload for guests - single file, immediate upload with defaults
  const handleQuickUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > maxFileSize) {
      toast.error(`${t.app.fileExceedsLimit} (${isAuth ? "500MB" : "50MB"})`);
      e.target.value = "";
      return;
    }

    const uploadId = crypto.randomUUID();
    setActiveUploads(prev => [...prev, { id: uploadId, fileName: file.name, progress: 0, status: "uploading" }]);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("expiresHours", isAuth ? "24" : "1");
      formData.append("maxDownloads", "-1");

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/transfer/upload");

        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            const pct = Math.round((ev.loaded / ev.total) * 100);
            setActiveUploads(prev => prev.map(u => u.id === uploadId ? { ...u, progress: pct } : u));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              const shareUrl = `${window.location.origin}${data.shareUrl}`;
              setUploadResults(prev => [...prev, { token: data.token, shareUrl, fileName: data.fileName }]);
              setActiveUploads(prev => prev.map(u => u.id === uploadId ? { ...u, progress: 100, status: "done" } : u));
              toast.success(`${data.fileName} uploaded!`);

              // Generate QR for first result
              if (uploadResults.length === 0) {
                QRCode.toDataURL(shareUrl, {
                  width: 200, margin: 2,
                  color: { dark: "#059669", light: "#ffffff" },
                  errorCorrectionLevel: "M",
                }).then(qr => setResultQrDataUrl(qr)).catch(() => {});
              }
            } catch {
              reject(new Error("Parse error"));
            }
          } else {
            reject(new Error("Upload failed"));
          }
          resolve();
        };

        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(formData);
      });

      queryClient.invalidateQueries({ queryKey: ["transfer-list"] });
    } catch {
      setActiveUploads(prev => prev.map(u => u.id === uploadId ? { ...u, status: "error" } : u));
      toast.error(`${t.app.failedToUpload}: ${file.name}`);
    }

    // Clean up completed uploads after a delay
    setTimeout(() => {
      setActiveUploads(prev => prev.filter(u => u.status === "uploading"));
    }, 3000);

    e.target.value = "";
  }, [isAuth, maxFileSize, t, queryClient, uploadResults.length]);

  // Handle file selection
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const newFiles = Array.from(files);
      setSelectedFiles((prev) => [...prev, ...newFiles]);
    }
    e.target.value = "";
  }, []);

  // Remove selected file
  const handleRemoveFile = useCallback((index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Upload all selected files
  const handleUploadAll = useCallback(async () => {
    if (selectedFiles.length === 0) return;
    setUploading(true);
    setUploadProgress(0);
    const results: { token: string; shareUrl: string; fileName: string }[] = [];

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const formData = new FormData();
        formData.append("file", file);
        if (usePassword && password) {
          formData.append("password", password);
        }
        if (expiryOption && expiryOption !== "0") {
          formData.append("expiresHours", expiryOption);
        }
        formData.append("maxDownloads", maxDownloads);

        const result = await new Promise<{ token: string; shareUrl: string; fileName: string } | null>(
          (resolve) => {
            const xhr = new XMLHttpRequest();
            xhr.open("POST", "/api/transfer/upload");

            xhr.upload.onprogress = (e) => {
              if (e.lengthComputable) {
                const fileProgress = ((i + e.loaded / e.total) / selectedFiles.length) * 100;
                setUploadProgress(Math.round(fileProgress));
              }
            };

            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                try {
                  const data = JSON.parse(xhr.responseText);
                  resolve({
                    token: data.token,
                    shareUrl: `${window.location.origin}${data.shareUrl}`,
                    fileName: data.fileName,
                  });
                } catch {
                  resolve(null);
                }
              } else {
                resolve(null);
              }
            };

            xhr.onerror = () => resolve(null);
            xhr.send(formData);
          }
        );

        if (result) {
          results.push(result);
        } else {
          toast.error(`${t.app.failedToUpload}: ${file.name}`);
        }
      }

      if (results.length > 0) {
        setUploadResults(results);
        toast.success(`${results.length} ${t.app.filesUploaded}`);
        queryClient.invalidateQueries({ queryKey: ["transfer-list"] });

        try {
          const qr = await QRCode.toDataURL(results[0].shareUrl, {
            width: 200,
            margin: 2,
            color: { dark: "#059669", light: "#ffffff" },
            errorCorrectionLevel: "M",
          });
          setResultQrDataUrl(qr);
        } catch {
          // QR generation failed silently
        }
      }

      setSelectedFiles([]);
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }, [selectedFiles, usePassword, password, expiryOption, maxDownloads, t, queryClient]);

  // Drag & Drop handlers
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setSelectedFiles((prev) => [...prev, ...files]);
    }
  }, []);

  const handleCopyLink = async (link: string, id: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLink(id);
      setTimeout(() => setCopiedLink(null), 2000);
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

  // Batch delete selected transfers
  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    const tokensToDelete = transfers
      .filter(t => selectedIds.has(t.id))
      .map(t => t.token);

    let successCount = 0;
    for (const token of tokensToDelete) {
      try {
        const res = await fetch(`/api/transfer/${token}`, { method: "DELETE" });
        if (res.ok) successCount++;
      } catch {
        // Continue with next
      }
    }

    if (successCount > 0) {
      toast.success(`${successCount} ${t.app.transfersDeleted}`);
      queryClient.invalidateQueries({ queryKey: ["transfer-list"] });
    }
    setSelectedIds(new Set());
    setDeleting(false);
  }, [selectedIds, transfers, t, queryClient]);

  // Toggle select transfer
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Select all / deselect all
  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredAndSortedTransfers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAndSortedTransfers.map(t => t.id)));
    }
  }, [selectedIds.size, filteredAndSortedTransfers]);

  // Download with progress
  const handleDownload = useCallback(async (transfer: TransferItem) => {
    setDownloadingId(transfer.id);
    setDownloadProgress(0);

    try {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/transfer/${transfer.token}/download`, true);
      xhr.responseType = "blob";
      xhr.setRequestHeader("Content-Type", "application/json");

      xhr.onprogress = (e) => {
        if (e.lengthComputable) {
          setDownloadProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const blob = xhr.response;
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = transfer.fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
          toast.success(t.app.downloadComplete);
        } else {
          toast.error(t.app.downloadFailed);
        }
        setDownloadingId(null);
        setDownloadProgress(0);
      };

      xhr.onerror = () => {
        toast.error(t.app.downloadFailed);
        setDownloadingId(null);
        setDownloadProgress(0);
      };

      xhr.send(JSON.stringify({}));
    } catch {
      toast.error(t.app.downloadFailed);
      setDownloadingId(null);
      setDownloadProgress(0);
    }
  }, [t]);

  const handleCreateQrSession = async () => {
    try {
      const res = await fetch("/api/transfer/qr-session", {
        method: "POST",
      });
      if (res.ok) {
        const data: QrSessionInfo = await res.json();
        setQrSession(data);
        setShowQrUpload(true);

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

  // Reset form when results are dismissed
  useEffect(() => {
    if (uploadResults.length === 0) {
      setResultQrDataUrl("");
      setCopiedLink(null);
    }
  }, [uploadResults]);

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

  // Get expiry countdown for a transfer - with detailed seconds
  const getExpiryCountdown = (expiresAt: string | null) => {
    if (!expiresAt) return null;
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return t.app.expired;
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };

  // Get expiry progress percentage (how much time has elapsed)
  const getExpiryProgress = (createdAt: string, expiresAt: string | null) => {
    if (!expiresAt) return -1; // Never expires
    const created = new Date(createdAt).getTime();
    const expires = new Date(expiresAt).getTime();
    const now = Date.now();
    const total = expires - created;
    const elapsed = now - created;
    if (total <= 0) return 100;
    return Math.min(100, Math.max(0, (elapsed / total) * 100));
  };

  // Total transfer size used
  const totalTransferSize = transfers.reduce((sum, t) => sum + t.fileSize, 0);

  // Capacity progress bars
  const fileSizeProgress = isAuth
    ? Math.min(100, (totalTransferSize / AUTH_MAX_FILE_SIZE) * 100)
    : Math.min(100, (totalTransferSize / ANON_MAX_FILE_SIZE) * 100);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-500/25">
              <Package className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold">{t.app.transferStation}</h2>
              <p className="text-sm text-muted-foreground">{t.app.transferStationDesc}</p>
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

        {/* Quick Upload - especially for guests */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04 }}
        >
          <Card className="border-dashed border-2 border-amber-300/60 dark:border-amber-700/40 bg-gradient-to-br from-amber-50/30 to-orange-50/20 dark:from-amber-950/10 dark:to-orange-950/10">
            <CardContent className="py-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-amber-500/10">
                  <Upload className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Quick Upload</h3>
                  <p className="text-xs text-muted-foreground">
                    {isAuth ? "Upload a file instantly with default settings" : "Upload a file without signing in (max 50MB, expires in 1 hour)"}
                  </p>
                </div>
                <div className="flex-1" />
                <label htmlFor="quick-upload-input">
                  <Button
                    size="sm"
                    className="gap-1.5 bg-amber-600 hover:bg-amber-700 cursor-pointer"
                    asChild
                  >
                    <span>
                      <Upload className="w-3.5 h-3.5" />
                      Choose File
                    </span>
                  </Button>
                </label>
                <input
                  id="quick-upload-input"
                  type="file"
                  className="hidden"
                  onChange={handleQuickUpload}
                />
              </div>

              {/* Active Uploads Progress */}
              <AnimatePresence>
                {activeUploads.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-2 mt-2"
                  >
                    {activeUploads.map((upload) => (
                      <motion.div
                        key={upload.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        className="flex items-center gap-3 p-2.5 rounded-lg bg-background/60 border border-border/50"
                      >
                        <div className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                          upload.status === "done" ? "bg-emerald-500/10" :
                          upload.status === "error" ? "bg-red-500/10" :
                          "bg-amber-500/10"
                        )}>
                          {upload.status === "done" ? (
                            <Check className="w-4 h-4 text-emerald-600" />
                          ) : upload.status === "error" ? (
                            <X className="w-4 h-4 text-red-500" />
                          ) : (
                            <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{upload.fileName}</p>
                          {upload.status === "uploading" && (
                            <div className="flex items-center gap-2 mt-1">
                              <Progress value={upload.progress} className="h-1.5 flex-1" />
                              <span className="text-[10px] text-muted-foreground font-mono w-8 text-right">{upload.progress}%</span>
                            </div>
                          )}
                          {upload.status === "done" && (
                            <p className="text-xs text-emerald-600 mt-0.5">Upload complete</p>
                          )}
                          {upload.status === "error" && (
                            <p className="text-xs text-red-500 mt-0.5">Upload failed</p>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
        </motion.div>

        {/* Mode Indicator Banner */}
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.03 }}
        >
          <div className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-xl border",
            isAuth
              ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/50 dark:border-emerald-800/30"
              : "bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/50 dark:border-amber-800/30"
          )}>
            {isAuth ? (
              <>
                <div className="p-1.5 rounded-lg bg-emerald-500/10">
                  <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Authenticated Mode</span>
                    <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 text-[10px] h-5">
                      Up to 500MB
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Full capacity · Up to 30 day expiry · Password protection · Unlimited downloads
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="p-1.5 rounded-lg bg-amber-500/10">
                  <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">Anonymous Mode</span>
                    <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 text-[10px] h-5">
                      Max 50MB
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Limited capacity · Up to 7 day expiry · Sign in for full features
                  </p>
                </div>
              </>
            )}
          </div>
        </motion.div>

        {/* Capacity Info with Progress Bars */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <Card className="border-amber-200/50 dark:border-amber-800/30">
            <CardContent className="py-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  {isAuth ? (
                    <Shield className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                  )}
                  <span className="font-medium">
                    {isAuth ? t.app.loggedInCapacity : t.app.anonymousCapacity}
                  </span>
                </div>
                {isAuth && transfers.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {formatFileSize(totalTransferSize)} {t.app.used}
                  </span>
                )}
              </div>

              {/* File Size Progress Bar */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Upload className="w-3 h-3" />
                    <span>{t.app.maxFileSize}: {isAuth ? "500MB" : "50MB"}</span>
                  </div>
                  <span>{Math.round(fileSizeProgress)}%</span>
                </div>
                <Progress value={fileSizeProgress} className="h-1.5" />
              </div>

              {/* Expiry Progress Bar */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Timer className="w-3 h-3" />
                    <span>{t.app.maxExpiry}: {isAuth ? "30" : "7"} {t.app.days}</span>
                  </div>
                  <span className="text-xs">{t.app.maxExpiryHint}</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all"
                    style={{ width: "100%" }}
                  />
                </div>
              </div>

              {!isAuth && (
                <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {t.app.anonymousUploadNote}
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Upload Area */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="border-amber-200/50 dark:border-amber-800/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="w-4 h-4 text-amber-600" />
                {t.app.uploadToStation}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {uploadResults.length === 0 ? (
                <>
                  {/* Drag & Drop Area */}
                  <div
                    className={`
                      relative flex flex-col items-center justify-center p-8 rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer
                      ${dragOver
                        ? "border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 scale-[1.01]"
                        : "border-muted-foreground/25 hover:border-amber-400 hover:bg-amber-50/30 dark:hover:bg-amber-950/10"
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
                      multiple
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                    <input
                      ref={folderInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={handleFileSelect}
                      {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
                    />
                    <motion.div
                      animate={dragOver ? { scale: 1.1, y: -5 } : { scale: 1, y: 0 }}
                      transition={{ type: "spring", stiffness: 300 }}
                    >
                      <Upload className="w-10 h-10 text-amber-500 mb-3" />
                    </motion.div>
                    <p className="text-sm font-medium">{t.app.dragDropTransfer}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t.app.uploadMultipleHint}</p>
                    {!isAuth && (
                      <p className="text-xs text-amber-500 mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {t.app.anonymousUploadNote}
                      </p>
                    )}
                    {uploading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-xl">
                        <div className="flex flex-col items-center gap-2 text-amber-600">
                          <div className="w-5 h-5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
                          <span className="text-sm font-medium">{t.app.uploading}... {uploadProgress}%</span>
                          <Progress value={uploadProgress} className="w-40 h-1.5" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* File/Folder buttons */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1 gap-1.5"
                      onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                      disabled={uploading}
                    >
                      <File className="w-4 h-4" />
                      {t.app.selectFiles}
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 gap-1.5"
                      onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click(); }}
                      disabled={uploading}
                    >
                      <FolderOpen className="w-4 h-4" />
                      {t.app.selectFolder}
                    </Button>
                  </div>

                  {/* Selected files list */}
                  {selectedFiles.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          {selectedFiles.length} {t.app.items} ({formatFileSize(totalSelectedSize)})
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-destructive"
                          onClick={() => setSelectedFiles([])}
                          disabled={uploading}
                        >
                          {t.app.clearAll}
                        </Button>
                      </div>
                      <ScrollArea className="max-h-40">
                        <div className="space-y-1">
                          {selectedFiles.slice(0, 20).map((file, idx) => {
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
                                  disabled={uploading}
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              </motion.div>
                            );
                          })}
                          {selectedFiles.length > 20 && (
                            <p className="text-xs text-muted-foreground text-center">
                              +{selectedFiles.length - 20} {t.app.moreFiles}
                            </p>
                          )}
                        </div>
                      </ScrollArea>

                      {/* Size warning */}
                      {selectedFiles.some(f => f.size > maxFileSize) && (
                        <p className="text-xs text-destructive flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {t.app.fileExceedsLimit} ({isAuth ? "500MB" : "50MB"})
                        </p>
                      )}

                      <Button
                        className="w-full gap-1.5 bg-amber-600 hover:bg-amber-700"
                        onClick={handleUploadAll}
                        disabled={uploading || selectedFiles.some(f => f.size > maxFileSize)}
                      >
                        <Upload className="w-4 h-4" />
                        {t.app.uploadToStation} ({selectedFiles.length})
                      </Button>
                    </div>
                  )}

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
                /* Upload Results */
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-600">
                      <ShieldCheck className="w-5 h-5" />
                      <span className="font-medium">
                        {uploadResults.length} {t.app.filesUploaded}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        setUploadResults([]);
                        setUsePassword(false);
                        setPassword("");
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* QR Code for first file */}
                  {resultQrDataUrl && uploadResults.length > 0 && (
                    <div className="flex flex-col sm:flex-row gap-4">
                      <div className="flex flex-col items-center gap-2 p-3 rounded-xl bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/30 dark:to-background border border-amber-200/50 dark:border-amber-800/30 shrink-0">
                        <img src={resultQrDataUrl} alt="QR Code" className="w-36 h-36" />
                        <p className="text-[10px] text-muted-foreground">{t.app.scanQrToAccess}</p>
                      </div>
                      <div className="flex-1 space-y-2">
                        {uploadResults.map((result, idx) => (
                          <motion.div
                            key={result.token}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            className="space-y-1"
                          >
                            <p className="text-sm font-medium truncate">{result.fileName}</p>
                            <div className="flex gap-2">
                              <Input
                                value={result.shareUrl}
                                readOnly
                                className="text-sm font-mono h-9"
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleCopyLink(result.shareUrl, result.token)}
                                className="shrink-0 gap-1"
                              >
                                {copiedLink === result.token ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </Button>
                            </div>
                            <Badge variant="outline" className="font-mono text-xs">
                              {t.app.transferToken}: {result.token}
                            </Badge>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )}
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
              <Card className="border-amber-200/50 dark:border-amber-800/30">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <QrCode className="w-4 h-4 text-amber-600" />
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
                      <div className="p-3 bg-white rounded-lg shadow-sm border border-amber-100 dark:border-amber-900/50">
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
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Package className="w-4 h-4 text-amber-600" />
                    {t.app.transferList}
                  </CardTitle>

                  {/* Search & Sort */}
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={t.app.searchTransfers}
                        className="pl-8 h-8 text-sm w-40 sm:w-52"
                      />
                    </div>
                    <Select value={sortField} onValueChange={(v) => setSortField(v as SortField)}>
                      <SelectTrigger className="h-8 text-sm w-28">
                        <ArrowUpDown className="w-3.5 h-3.5 mr-1" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="name">{t.app.name}</SelectItem>
                        <SelectItem value="date">{t.app.modified}</SelectItem>
                        <SelectItem value="size">{t.app.size}</SelectItem>
                        <SelectItem value="expiry">{t.app.expiry}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setSortDirection(d => d === "asc" ? "desc" : "asc")}
                      title={sortDirection === "asc" ? t.app.ascending : t.app.descending}
                    >
                      <ArrowUpDown className={`w-3.5 h-3.5 transition-transform ${sortDirection === "desc" ? "rotate-180" : ""}`} />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {transfersLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center gap-3 p-3">
                        <Skeleton className="w-8 h-8 rounded" />
                        <div className="flex-1 space-y-1.5">
                          <Skeleton className="h-4 w-48 rounded" />
                          <Skeleton className="h-3 w-32 rounded" />
                        </div>
                        <Skeleton className="h-4 w-12 rounded" />
                      </div>
                    ))}
                  </div>
                ) : filteredAndSortedTransfers.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center justify-center py-8 text-muted-foreground"
                  >
                    <motion.div
                      animate={{ y: [0, -8, 0] }}
                      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <Package className="w-12 h-12 mb-2 opacity-30" />
                    </motion.div>
                    <p className="text-sm font-medium">{t.app.noTransfersYet}</p>
                    <p className="text-xs mt-1">{t.app.transfersWillAppearHere}</p>
                  </motion.div>
                ) : (
                  <>
                    {/* Batch actions bar */}
                    {selectedIds.size > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-2 mb-3 p-2 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200/50 dark:border-amber-800/30"
                      >
                        <span className="text-sm font-medium">{selectedIds.size} {t.app.selected}</span>
                        <div className="flex-1" />
                        <Button
                          variant="destructive"
                          size="sm"
                          className="gap-1 h-7 text-xs"
                          onClick={handleBatchDelete}
                          disabled={deleting}
                        >
                          <Trash2 className="w-3 h-3" />
                          {deleting ? t.app.deleting : t.app.batchDelete}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setSelectedIds(new Set())}
                        >
                          {t.app.cancel}
                        </Button>
                      </motion.div>
                    )}

                    <ScrollArea className="max-h-96">
                      <div className="space-y-0.5">
                        {/* Select all row */}
                        {filteredAndSortedTransfers.length > 1 && (
                          <div className="flex items-center gap-3 p-2 text-xs text-muted-foreground border-b border-border/30 mb-1">
                            <Checkbox
                              checked={selectedIds.size === filteredAndSortedTransfers.length}
                              onCheckedChange={toggleSelectAll}
                              className="shrink-0"
                            />
                            <span>{t.app.selectAll}</span>
                          </div>
                        )}
                        {filteredAndSortedTransfers.map((transfer, idx) => {
                          const countdown = getExpiryCountdown(transfer.expiresAt);
                          const { icon: FileIcon, color } = getFileTypeIcon(transfer.fileName, transfer.mimeType);
                          const hasImage = isImageFile(transfer.fileName, transfer.mimeType);
                          const isDownloading = downloadingId === transfer.id;
                          return (
                            <motion.div
                              key={transfer.id}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: idx * 0.03 }}
                              className={`flex items-center gap-3 p-3 rounded-lg border transition-colors hover:bg-muted/50 group ${
                                selectedIds.has(transfer.id)
                                  ? "border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/10"
                                  : transfer.isExpired
                                    ? "opacity-50 border-muted"
                                    : "border-border/50"
                              }`}
                            >
                              <Checkbox
                                checked={selectedIds.has(transfer.id)}
                                onCheckedChange={() => toggleSelect(transfer.id)}
                                className="shrink-0"
                              />
                              {/* Thumbnail or icon */}
                              {hasImage ? (
                                <div className="w-10 h-10 rounded-md overflow-hidden bg-muted shrink-0 flex items-center justify-center">
                                  <img
                                    src={`${transfer.shareUrl}/download?mode=inline`}
                                    alt={transfer.fileName}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).style.display = "none";
                                      (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
                                    }}
                                  />
                                  <FileIcon className={`w-5 h-5 ${color} hidden`} />
                                </div>
                              ) : transfer.isFolder ? (
                                <Folder className="w-8 h-8 text-amber-500 shrink-0" />
                              ) : (
                                <FileIcon className={`w-8 h-8 ${color} shrink-0`} />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{transfer.fileName}</p>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
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
                                  ) : countdown ? (
                                    <Badge variant="outline" className={cn(
                                      "h-4 px-1 text-[9px]",
                                      getExpiryProgress(transfer.createdAt, transfer.expiresAt) > 80 && "border-amber-500/50 text-amber-600"
                                    )}>
                                      <Clock className="w-2.5 h-2.5 mr-0.5" />
                                      {countdown}
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="h-4 px-1 text-[9px]">
                                      <Clock className="w-2.5 h-2.5 mr-0.5" />
                                      Never
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {/* Download progress or count */}
                                {isDownloading ? (
                                  <div className="flex flex-col items-center gap-0.5 w-16">
                                    <Progress value={downloadProgress} className="h-1 w-full" />
                                    <span className="text-[10px] text-muted-foreground">{downloadProgress}%</span>
                                  </div>
                                ) : (
                                  <div className="text-right">
                                    <p className="text-xs font-medium">
                                      {transfer.downloadCount}
                                      {transfer.maxDownloads > 0 ? `/${transfer.maxDownloads}` : ""}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">{t.app.downloads}</p>
                                  </div>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => handleDownload(transfer)}
                                  title={t.app.download}
                                  disabled={isDownloading}
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => handleCopyLink(`${window.location.origin}${transfer.shareUrl}`, transfer.id)}
                                  title={t.app.copyTransferLink || "Copy Download Link"}
                                >
                                  {copiedLink === transfer.id ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs gap-1 px-2"
                                  onClick={() => handleCopyLink(`${window.location.origin}${transfer.shareUrl}`, `dl-${transfer.id}`)}
                                >
                                  {copiedLink === `dl-${transfer.id}` ? (
                                    <Check className="w-3 h-3 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                  <span className="hidden sm:inline">{t.app.copyTransferLink || "Copy Link"}</span>
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
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </>
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
