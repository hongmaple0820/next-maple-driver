"use client";

import { useState, useEffect, useCallback } from "react";
import {
  HardDrive,
  Download,
  Eye,
  Lock,
  Clock,
  AlertTriangle,
  FileX,
  Loader2,
  Cloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { FileTypeIconByProps } from "@/components/file-type-icon";
import { formatFileSize, formatDate, isPreviewable } from "@/lib/file-utils";
import { cn } from "@/lib/utils";

interface ShareFile {
  id: string;
  name: string;
  type: "folder" | "file";
  size: number;
  mimeType: string;
  createdAt: string;
  updatedAt: string;
}

interface ShareData {
  id: string;
  token: string;
  fileId: string;
  hasPassword: boolean;
  expiresAt?: string;
  downloadCount: number;
  createdAt: string;
  file: ShareFile;
}

type PageState = "loading" | "password" | "ready" | "expired" | "not-found" | "deleted";

export function ShareClientWrapper({ shareId }: { shareId: string }) {
  const [state, setState] = useState<PageState>("loading");
  const [shareData, setShareData] = useState<ShareData | null>(null);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Fetch share info on mount
  useEffect(() => {
    async function fetchShareInfo() {
      try {
        const res = await fetch(`/api/share/${shareId}`);
        const data = await res.json();

        if (res.status === 404) {
          setState("not-found");
          return;
        }
        if (res.status === 410) {
          setState("expired");
          return;
        }
        if (!res.ok) {
          setState("not-found");
          return;
        }

        // If has password, show password form
        if (data.hasPassword) {
          setShareData(data);
          setState("password");
        } else {
          setShareData(data);
          setState("ready");
        }
      } catch {
        setState("not-found");
      }
    }

    fetchShareInfo();
  }, [shareId]);

  const handlePasswordSubmit = useCallback(async () => {
    if (!password.trim()) return;
    setVerifying(true);
    setPasswordError("");

    try {
      const res = await fetch(`/api/share/${shareId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.status === 403) {
        setPasswordError("Incorrect password. Please try again.");
        setVerifying(false);
        return;
      }
      if (res.status === 410) {
        setState("expired");
        setVerifying(false);
        return;
      }
      if (!res.ok) {
        setPasswordError("Something went wrong. Please try again.");
        setVerifying(false);
        return;
      }

      const data = await res.json();
      setShareData(data);
      setState("ready");
    } catch {
      setPasswordError("Network error. Please try again.");
    } finally {
      setVerifying(false);
    }
  }, [shareId, password]);

  const handleDownload = useCallback(() => {
    if (!shareData) return;
    setDownloading(true);
    window.open(`/api/files/download?id=${shareData.file.id}`, "_blank");
    setTimeout(() => setDownloading(false), 2000);
  }, [shareData]);

  const handlePreview = useCallback(() => {
    if (!shareData) return;
    window.open(`/api/files/download?id=${shareData.file.id}&mode=inline`, "_blank");
  }, [shareData]);

  const fileIsPreviewable = shareData ? isPreviewable({
    id: shareData.file.id,
    name: shareData.file.name,
    type: shareData.file.type,
    mimeType: shareData.file.mimeType,
    size: shareData.file.size,
    parentId: "",
    starred: false,
    trashed: false,
    createdAt: shareData.file.createdAt,
    updatedAt: shareData.file.updatedAt,
  }) : false;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-emerald-50 via-white to-sky-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      {/* Branding */}
      <div className="flex items-center gap-2 mb-8">
        <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center">
          <Cloud className="w-6 h-6 text-white" />
        </div>
        <span className="text-xl font-bold text-foreground">CloudDrive</span>
      </div>

      {/* Loading State */}
      {state === "loading" && (
        <Card className="w-full max-w-md shadow-lg">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Loader2 className="w-10 h-10 text-emerald-600 animate-spin mb-4" />
            <p className="text-muted-foreground">Loading shared file...</p>
          </CardContent>
        </Card>
      )}

      {/* Not Found State */}
      {state === "not-found" && (
        <Card className="w-full max-w-md shadow-lg">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center mb-4">
              <FileX className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-lg font-semibold mb-1">Link Not Found</h2>
            <p className="text-sm text-muted-foreground text-center max-w-xs">
              This share link does not exist or has been removed.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Expired State */}
      {state === "expired" && (
        <Card className="w-full max-w-md shadow-lg">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center mb-4">
              <AlertTriangle className="w-8 h-8 text-amber-500" />
            </div>
            <h2 className="text-lg font-semibold mb-1">Link Expired</h2>
            <p className="text-sm text-muted-foreground text-center max-w-xs">
              This share link has expired. Please contact the owner for a new link.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Deleted State */}
      {state === "deleted" && (
        <Card className="w-full max-w-md shadow-lg">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
              <FileX className="w-8 h-8 text-gray-400" />
            </div>
            <h2 className="text-lg font-semibold mb-1">File Deleted</h2>
            <p className="text-sm text-muted-foreground text-center max-w-xs">
              This file has been deleted and is no longer available.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Password State */}
      {state === "password" && shareData && (
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center mb-3">
              <FileTypeIconByProps
                type={shareData.file.type}
                mimeType={shareData.file.mimeType}
                name={shareData.file.name}
                className="w-7 h-7"
              />
            </div>
            <h2 className="text-lg font-semibold">{shareData.file.name}</h2>
            <p className="text-sm text-muted-foreground">
              This file is password protected
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setPasswordError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") handlePasswordSubmit(); }}
                className="pl-9"
                autoFocus
              />
            </div>
            {passwordError && (
              <p className="text-sm text-destructive">{passwordError}</p>
            )}
          </CardContent>
          <CardFooter>
            <Button
              onClick={handlePasswordSubmit}
              disabled={verifying || !password.trim()}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {verifying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Access File"
              )}
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Ready State */}
      {state === "ready" && shareData && (
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-20 h-20 rounded-2xl bg-muted/50 flex items-center justify-center mb-3">
              <FileTypeIconByProps
                type={shareData.file.type}
                mimeType={shareData.file.mimeType}
                name={shareData.file.name}
                className="w-10 h-10"
              />
            </div>
            <h2 className="text-lg font-semibold break-words">{shareData.file.name}</h2>
            <p className="text-sm text-muted-foreground">
              Shared via CloudDrive
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* File info grid */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <HardDrive className="w-4 h-4" />
                <span>Size: {formatFileSize(shareData.file.size)}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="w-4 h-4" />
                <span>Uploaded: {formatDate(shareData.file.createdAt)}</span>
              </div>
            </div>

            {/* Expiry info */}
            {shareData.expiresAt && (
              <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
                <Clock className="w-4 h-4 shrink-0" />
                <span>Expires {formatDate(shareData.expiresAt)}</span>
              </div>
            )}

            {/* Download count */}
            <div className="text-xs text-muted-foreground text-center">
              Downloaded {shareData.downloadCount} time{shareData.downloadCount !== 1 ? "s" : ""}
            </div>
          </CardContent>
          <CardFooter className="flex gap-2">
            {fileIsPreviewable && (
              <Button
                variant="outline"
                onClick={handlePreview}
                className="flex-1 gap-2"
              >
                <Eye className="w-4 h-4" />
                Preview
              </Button>
            )}
            <Button
              onClick={handleDownload}
              disabled={downloading}
              className={cn(
                "gap-2 bg-emerald-600 hover:bg-emerald-700 text-white",
                fileIsPreviewable ? "flex-1" : "w-full"
              )}
            >
              <Download className="w-4 h-4" />
              {downloading ? "Starting..." : "Download"}
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Footer */}
      <p className="mt-6 text-xs text-muted-foreground">
        Powered by CloudDrive &middot; Secure file sharing
      </p>
    </div>
  );
}
