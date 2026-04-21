"use client";

import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Share2, Copy, Check, Link } from "lucide-react";
import type { ShareInfo } from "@/lib/file-utils";

export function ShareDialog() {
  const { shareFile, setShareFile } = useFileStore();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [useExpiry, setUseExpiry] = useState(false);
  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!shareFile) {
      setShareInfo(null);
      setPassword("");
      setExpiresAt("");
      setUsePassword(false);
      setUseExpiry(false);
      setCopied(false);
    }
  }, [shareFile]);

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
      }
    } catch {
      // Error handled silently
    } finally {
      setLoading(false);
    }
  };

  const shareLink = shareInfo
    ? `${window.location.origin}/shared/${shareInfo.token}`
    : "";

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

  const handleOpenChange = (open: boolean) => {
    if (!open) setShareFile(null);
  };

  return (
    <Dialog open={!!shareFile} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-emerald-600" />
            Share File
          </DialogTitle>
          <DialogDescription>
            Create a share link for &quot;{shareFile?.name}&quot;.
          </DialogDescription>
        </DialogHeader>

        {!shareInfo ? (
          <div className="space-y-4 py-2">
            {/* Password option */}
            <div className="flex items-center justify-between">
              <Label htmlFor="use-password" className="text-sm">
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
              <Label htmlFor="use-expiry" className="text-sm">
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
              <Label>Share Link</Label>
              <div className="flex gap-2">
                <Input value={shareLink} readOnly className="text-sm" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopy}
                  className="shrink-0"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Password display */}
            {shareInfo.password && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Password</Label>
                <p className="text-sm font-mono bg-muted p-2 rounded">
                  {shareInfo.password}
                </p>
              </div>
            )}

            {/* Expiry display */}
            {shareInfo.expiresAt && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Expires</Label>
                <p className="text-sm">
                  {new Date(shareInfo.expiresAt).toLocaleString()}
                </p>
              </div>
            )}

            {/* Download count */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Link className="w-4 h-4" />
              {shareInfo.downloadCount} download{shareInfo.downloadCount !== 1 ? "s" : ""}
            </div>
          </div>
        )}

        <DialogFooter>
          {!shareInfo ? (
            <>
              <Button variant="outline" onClick={() => setShareFile(null)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateShare}
                disabled={loading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {loading ? "Creating..." : "Create Link"}
              </Button>
            </>
          ) : (
            <Button onClick={() => setShareFile(null)}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
