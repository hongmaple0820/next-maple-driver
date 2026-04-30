"use client";

import { useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import {
  Cloud,
  Upload,
  Loader2,
  CheckCircle,
  AlertCircle,
  XCircle,
  File,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatFileSize } from "@/lib/file-utils";
import { useI18n } from "@/lib/i18n";

type PageState = "ready" | "uploading" | "success" | "error" | "expired" | "invalid";

interface UploadResult {
  token: string;
  fileName: string;
  fileSize: number;
  shareUrl: string;
}

export default function TransferUploadClient({ sessionId }: { sessionId: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<PageState>(sessionId ? "ready" : "invalid");
  const [dragOver, setDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(async (file: File) => {
    if (!sessionId) {
      setState("invalid");
      return;
    }

    setState("uploading");
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append("file", file);

      // Use XMLHttpRequest for progress tracking
      const xhr = new XMLHttpRequest();

      const result = await new Promise<UploadResult>((resolve, reject) => {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            setUploadProgress(percent);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              resolve(data);
            } catch {
              reject(new Error("Invalid response"));
            }
          } else if (xhr.status === 400) {
            try {
              const data = JSON.parse(xhr.responseText);
              if (data.error?.includes("expired")) {
                setState("expired");
              } else {
                setErrorMessage(data.error || "Upload failed");
                setState("error");
              }
            } catch {
              setErrorMessage("Upload failed");
              setState("error");
            }
            reject(new Error("Upload failed"));
          } else {
            try {
              const data = JSON.parse(xhr.responseText);
              setErrorMessage(data.error || "Upload failed");
            } catch {
              setErrorMessage("Upload failed");
            }
            setState("error");
            reject(new Error("Upload failed"));
          }
        };

        xhr.onerror = () => {
          setErrorMessage("Network error. Please try again.");
          setState("error");
          reject(new Error("Network error"));
        };

        xhr.open("POST", `/api/transfer/qr-upload/${sessionId}`);
        xhr.send(formData);
      });

      setUploadResult({
        token: result.token,
        fileName: result.fileName,
        fileSize: result.fileSize,
        shareUrl: `${window.location.origin}${result.shareUrl}`,
      });
      setState("success");
    } catch {
      // Error already handled in XHR callbacks
    }
  }, [sessionId]);

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-sky-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 p-4">
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
          {/* Invalid Session State */}
          {state === "invalid" && (
            <div className="flex flex-col items-center justify-center py-16 px-6">
              <div className="w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-950/30 flex items-center justify-center mb-4">
                <XCircle className="w-8 h-8 text-red-500" />
              </div>
              <h2 className="text-lg font-semibold mb-1">{t.app.transferNotFound}</h2>
              <p className="text-sm text-muted-foreground text-center">
                {t.app.scanToUploadDesc}
              </p>
            </div>
          )}

          {/* Expired Session State */}
          {state === "expired" && (
            <div className="flex flex-col items-center justify-center py-16 px-6">
              <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-950/30 flex items-center justify-center mb-4">
                <AlertCircle className="w-8 h-8 text-amber-500" />
              </div>
              <h2 className="text-lg font-semibold mb-1">{t.app.transferExpiredDesc}</h2>
              <p className="text-sm text-muted-foreground text-center">
                {t.app.transferAutoCleanup}
              </p>
            </div>
          )}

          {/* Ready / Upload State */}
          {(state === "ready" || state === "uploading") && (
            <div className="flex flex-col items-center py-10 px-6">
              <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-950/30 flex items-center justify-center mb-4">
                <Send className="w-7 h-7 text-emerald-600" />
              </div>
              <h2 className="text-lg font-semibold mb-1">{t.app.mobileUpload}</h2>
              <p className="text-sm text-muted-foreground mb-6 text-center">
                {t.app.dragDropTransfer}
              </p>

              {/* Drag & Drop Area */}
              <div
                className={`
                  relative w-full flex flex-col items-center justify-center p-8 rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer
                  ${dragOver
                    ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 scale-[1.01]"
                    : "border-muted-foreground/25 hover:border-emerald-400 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/10"
                  }
                `}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => state !== "uploading" && fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileSelect}
                  disabled={state === "uploading"}
                />
                <motion.div
                  animate={dragOver ? { scale: 1.1, y: -5 } : { scale: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <Upload className="w-10 h-10 text-emerald-500 mb-3" />
                </motion.div>
                <p className="text-sm font-medium">{t.app.dragDropTransfer}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t.app.anonymousUploadNote}
                </p>

                {state === "uploading" && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/90 rounded-xl gap-3">
                    <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                    <p className="text-sm font-medium text-emerald-600">
                      Uploading... {uploadProgress}%
                    </p>
                    <div className="w-48 h-2 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-emerald-500 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${uploadProgress}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Success State */}
          {state === "success" && uploadResult && (
            <div className="flex flex-col items-center py-10 px-6">
              <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-950/30 flex items-center justify-center mb-4">
                <CheckCircle className="w-7 h-7 text-emerald-600" />
              </div>
              <h2 className="text-lg font-semibold mb-1">{t.app.uploadSuccess || t.app.transferCreated}</h2>

              <div className="w-full space-y-3 mt-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <File className="w-8 h-8 text-emerald-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{uploadResult.fileName}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(uploadResult.fileSize)}</p>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{t.app.transferToken}</p>
                  <p className="text-sm font-mono bg-muted p-2 rounded">{uploadResult.token}</p>
                </div>

                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{t.app.shareLink}</p>
                  <p className="text-sm font-mono bg-muted p-2 rounded break-all">{uploadResult.shareUrl}</p>
                </div>
              </div>

              <Button
                onClick={() => {
                  navigator.clipboard.writeText(uploadResult.shareUrl);
                }}
                className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {t.app.copyLink}
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  setState("ready");
                  setUploadResult(null);
                  setUploadProgress(0);
                }}
                className="w-full mt-2"
              >
                {t.app.uploadToTransfer}
              </Button>
            </div>
          )}

          {/* Error State */}
          {state === "error" && (
            <div className="flex flex-col items-center py-10 px-6">
              <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-950/30 flex items-center justify-center mb-4">
                <XCircle className="w-7 h-7 text-red-500" />
              </div>
              <h2 className="text-lg font-semibold mb-1">{t.app.transferNotFound}</h2>
              <p className="text-sm text-muted-foreground text-center mb-4">
                {errorMessage}
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setState("ready");
                  setErrorMessage("");
                }}
              >
                {t.app.uploadToTransfer}
              </Button>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground/50 mt-6">
          Powered by CloudDrive &middot; {t.app.transferAutoCleanup}
        </p>
      </motion.div>
    </div>
  );
}
