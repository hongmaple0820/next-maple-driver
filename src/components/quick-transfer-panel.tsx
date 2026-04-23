"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { formatFileSize } from "@/lib/file-utils";
import { useI18n } from "@/lib/i18n";
import { useSession } from "next-auth/react";

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

export function QuickTransferPanel() {
  const { t } = useI18n();
  const { data: sessionData } = useSession();
  const queryClient = useQueryClient();
  const { currentFolderId } = useFileStore();

  // Active tab
  const [activeTab, setActiveTab] = useState("receive");

  // Receive tab state - generate code
  const [activeSession, setActiveSession] = useState<QuickTransferSession | null>(null);
  const [generating, setGenerating] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  // Send tab state - enter code and send files
  const [recipientCode, setRecipientCode] = useState("");
  const [codeInfo, setCodeInfo] = useState<CodeInfo | null>(null);
  const [checkingCode, setCheckingCode] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const sendFileInputRef = useRef<HTMLInputElement>(null);
  const sendFolderInputRef = useRef<HTMLInputElement>(null);

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

  // Set active session from fetched sessions
  useEffect(() => {
    if (sessions.length > 0 && !activeSession) {
      setActiveSession(sessions[0]);
    }
  }, [sessions, activeSession]);

  // Generate code
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
        const data: QuickTransferSession = await res.json();
        setActiveSession(data);
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

  // Check recipient code
  const handleCheckCode = useCallback(async () => {
    if (!recipientCode.trim()) return;
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
    // Reset input so same file can be selected again
    e.target.value = "";
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
        // Preserve relative path for folder uploads
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || "";
        formData.append(`folderPath-${index}`, relativePath.substring(0, relativePath.lastIndexOf("/")) || "");
      });

      // Use XMLHttpRequest for progress tracking
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

  // Time remaining for session
  const getTimeRemaining = useCallback((expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return t.app.expired;
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }, [t]);

  const totalSelectedSize = selectedFiles.reduce((sum, f) => sum + f.size, 0);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
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
                  {activeSession && activeSession.isActive && new Date(activeSession.expiresAt) > new Date() ? (
                    <div className="space-y-4">
                      {/* Show active code */}
                      <div className="flex flex-col items-center gap-3 p-6 rounded-xl bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/30 dark:to-background border border-emerald-200/50 dark:border-emerald-800/30">
                        <p className="text-sm text-muted-foreground">{t.app.yourTransferCode}</p>
                        <div className="flex items-center gap-3">
                          <span className="text-4xl font-mono font-bold tracking-[0.3em] text-emerald-700 dark:text-emerald-400">
                            {activeSession.code}
                          </span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={() => handleCopyCode(activeSession.code)}
                          >
                            {codeCopied ? (
                              <Check className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{t.app.codeExpires}: {getTimeRemaining(activeSession.expiresAt)}</span>
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
                      <div className="flex flex-col items-center gap-3 p-8 rounded-xl border-2 border-dashed border-muted-foreground/25">
                        <Zap className="w-10 h-10 text-emerald-500" />
                        <p className="text-sm text-muted-foreground text-center">{t.app.noActiveTransfers}</p>
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
                      </div>
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
                      <Input
                        value={recipientCode}
                        onChange={(e) => {
                          setRecipientCode(e.target.value.toUpperCase());
                          setCodeInfo(null);
                        }}
                        placeholder={t.app.transferCodePlaceholder}
                        className="font-mono text-lg tracking-[0.2em] text-center uppercase"
                        maxLength={6}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleCheckCode();
                        }}
                      />
                      <Button
                        onClick={handleCheckCode}
                        disabled={checkingCode || !recipientCode.trim()}
                        className="shrink-0 gap-1"
                      >
                        {checkingCode ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <ArrowRight className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
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

                  {/* File selection */}
                  {codeInfo && codeInfo.isActive && !codeInfo.isExpired && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="space-y-3"
                    >
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="flex-1 gap-1.5"
                          onClick={() => sendFileInputRef.current?.click()}
                          disabled={sending}
                        >
                          <File className="w-4 h-4" />
                          {t.app.selectFiles}
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1 gap-1.5"
                          onClick={() => sendFolderInputRef.current?.click()}
                          disabled={sending}
                        >
                          <Folder className="w-4 h-4" />
                          {t.app.selectFolder}
                        </Button>
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

                      {/* Selected files list */}
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
                              {selectedFiles.map((file, idx) => (
                                <div
                                  key={`${file.name}-${idx}`}
                                  className="flex items-center gap-2 p-2 rounded-lg border border-border/50 text-sm"
                                >
                                  {(file as File & { webkitRelativePath?: string }).webkitRelativePath ? (
                                    <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                                  ) : (
                                    <File className="w-4 h-4 text-emerald-500 shrink-0" />
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
                                </div>
                              ))}
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
