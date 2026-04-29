"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Cloud,
  HardDrive,
  ExternalLink,
  Loader2,
  CheckCircle2,
  XCircle,
  QrCode,
  Cookie,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Clock,
  Info,
  RefreshCw,
  Smartphone,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---- Types ----
interface DriverInfo {
  id: string;
  name: string;
  type: string;
  status: string;
  authType: string;
  authStatus: string;
  config?: string;
  mountPath?: string;
}

interface DriverAuthorizationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driver: DriverInfo | null;
  onAuthorized?: () => void;
}

// Driver type visual config
const DRIVER_VISUAL_CONFIG: Record<string, {
  icon: typeof Cloud;
  color: string;
  bgColor: string;
  borderColor: string;
  label: string;
}> = {
  baidu: { icon: Cloud, color: "text-blue-500", bgColor: "bg-blue-500/10", borderColor: "border-blue-500/20", label: "百度网盘" },
  aliyun: { icon: Cloud, color: "text-orange-500", bgColor: "bg-orange-500/10", borderColor: "border-orange-500/20", label: "阿里云盘" },
  onedrive: { icon: Cloud, color: "text-sky-500", bgColor: "bg-sky-500/10", borderColor: "border-sky-500/20", label: "OneDrive" },
  google: { icon: Cloud, color: "text-red-500", bgColor: "bg-red-500/10", borderColor: "border-red-500/20", label: "Google Drive" },
  "115": { icon: HardDrive, color: "text-amber-600", bgColor: "bg-amber-600/10", borderColor: "border-amber-600/20", label: "115网盘" },
  quark: { icon: HardDrive, color: "text-purple-500", bgColor: "bg-purple-500/10", borderColor: "border-purple-500/20", label: "夸克网盘" },
};

function isOAuthType(type: string) {
  return ["baidu", "aliyun", "onedrive", "google"].includes(type);
}

function isCookieType(type: string) {
  return ["115", "quark"].includes(type);
}

// Auth status badge component
function AuthStatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { color: string; icon: typeof ShieldCheck; label: string }> = {
    authorized: { color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30", icon: ShieldCheck, label: "已授权" },
    pending: { color: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30", icon: Clock, label: "待授权" },
    expired: { color: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30", icon: ShieldAlert, label: "已过期" },
    error: { color: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30", icon: ShieldX, label: "错误" },
    none: { color: "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30", icon: ShieldCheck, label: "无需授权" },
  };
  const c = cfg[status] || cfg.pending;
  const Icon = c.icon;
  return (
    <Badge variant="outline" className={cn("text-[10px] gap-1", c.color)}>
      <Icon className="w-3 h-3" />
      {c.label}
    </Badge>
  );
}

// ---- Main Component ----
export function DriverAuthorizationDialog({
  open,
  onOpenChange,
  driver,
  onAuthorized,
}: DriverAuthorizationDialogProps) {
  const queryClient = useQueryClient();
  const qrPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // OAuth state
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthPopupOpen, setOauthPopupOpen] = useState(false);

  // Cookie state
  const [cookieValue, setCookieValue] = useState("");
  const [cookieSubmitting, setCookieSubmitting] = useState(false);
  const [cookieResult, setCookieResult] = useState<"idle" | "success" | "error">("idle");

  // QR code state
  const [qrLoading, setQrLoading] = useState(false);
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [qr115Params, setQr115Params] = useState<{ uid: string; time: string; sign: string } | null>(null);
  const [qrStatus, setQrStatus] = useState<"idle" | "waiting" | "scanned" | "confirmed" | "expired" | "error">("idle");
  const [qrMessage, setQrMessage] = useState("");

  const visualConfig = driver ? DRIVER_VISUAL_CONFIG[driver.type] : null;
  const isOAuth = driver ? isOAuthType(driver.type) : false;
  const isCookie = driver ? isCookieType(driver.type) : false;

  // Reset state when dialog opens/closes
  const resetState = useCallback(() => {
    setOauthLoading(false);
    setOauthPopupOpen(false);
    setCookieValue("");
    setCookieSubmitting(false);
    setCookieResult("idle");
    setQrLoading(false);
    setQrImageUrl(null);
    setQrToken(null);
    setQr115Params(null);
    setQrStatus("idle");
    setQrMessage("");
    if (qrPollIntervalRef.current) {
      clearInterval(qrPollIntervalRef.current);
      qrPollIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) {
      resetState();
    }
  }, [open, resetState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (qrPollIntervalRef.current) {
        clearInterval(qrPollIntervalRef.current);
      }
    };
  }, []);

  // ---- OAuth Handlers ----
  const handleOAuthAuthorize = useCallback(async () => {
    if (!driver) return;
    setOauthLoading(true);
    try {
      const res = await fetch(`/api/drivers/${driver.id}/authorize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "授权失败" }));
        throw new Error(err.error || "授权失败");
      }
      const data = await res.json();
      if (data.authorizationUrl) {
        // Open in popup
        const popup = window.open(
          data.authorizationUrl,
          "oauth-authorization",
          "width=600,height=700,scrollbars=yes"
        );
        setOauthPopupOpen(true);

        // Poll for popup closure
        const pollInterval = setInterval(() => {
          if (!popup || popup.closed) {
            clearInterval(pollInterval);
            setOauthPopupOpen(false);
            // Refresh driver status
            queryClient.invalidateQueries({ queryKey: ["my-drivers"] });
            queryClient.invalidateQueries({ queryKey: ["admin-drivers"] });
            queryClient.invalidateQueries({ queryKey: ["sidebar-drivers"] });
            toast.success("授权流程已完成，请检查授权状态");
            setOauthLoading(false);
            onAuthorized?.();
          }
        }, 500);

        // Timeout after 5 minutes
        setTimeout(() => {
          clearInterval(pollInterval);
          setOauthPopupOpen(false);
          setOauthLoading(false);
        }, 300000);
      } else {
        toast.success("授权成功！");
        setOauthLoading(false);
        queryClient.invalidateQueries({ queryKey: ["my-drivers"] });
        queryClient.invalidateQueries({ queryKey: ["admin-drivers"] });
        queryClient.invalidateQueries({ queryKey: ["sidebar-drivers"] });
        onAuthorized?.();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "OAuth 授权失败");
      setOauthLoading(false);
    }
  }, [driver, queryClient, onAuthorized]);

  // ---- Cookie Handlers ----
  const handleCookieSubmit = useCallback(async () => {
    if (!driver || !cookieValue.trim()) {
      toast.error("请输入 Cookie");
      return;
    }
    setCookieSubmitting(true);
    setCookieResult("idle");
    try {
      const res = await fetch(`/api/drivers/${driver.id}/authorize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookies: cookieValue.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Cookie 验证失败" }));
        throw new Error(err.error || "Cookie 验证失败");
      }
      const data = await res.json();
      if (data.success) {
        setCookieResult("success");
        toast.success(`${visualConfig?.label || "驱动"} 登录成功！`);
        queryClient.invalidateQueries({ queryKey: ["my-drivers"] });
        queryClient.invalidateQueries({ queryKey: ["admin-drivers"] });
        queryClient.invalidateQueries({ queryKey: ["sidebar-drivers"] });
        onAuthorized?.();
      } else {
        throw new Error(data.error || "Cookie 验证失败");
      }
    } catch (error) {
      setCookieResult("error");
      toast.error(error instanceof Error ? error.message : "Cookie 验证失败");
    } finally {
      setCookieSubmitting(false);
    }
  }, [driver, cookieValue, visualConfig, queryClient, onAuthorized]);

  // ---- QR Code Handlers ----
  const handleQrCodeRequest = useCallback(async () => {
    if (!driver) return;
    setQrLoading(true);
    setQrStatus("idle");
    setQrImageUrl(null);
    setQrToken(null);
    setQr115Params(null);

    if (qrPollIntervalRef.current) {
      clearInterval(qrPollIntervalRef.current);
      qrPollIntervalRef.current = null;
    }

    try {
      const res = await fetch(`/api/drivers/${driver.id}/qr-login`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "获取二维码失败" }));
        throw new Error(err.error || "获取二维码失败");
      }
      const data = await res.json();

      if (data.driverType === "quark") {
        setQrToken(data.token);
        // Use qrcodeUrl if available, otherwise use imageUrl
        setQrImageUrl(data.qrcodeUrl || data.imageUrl);
      } else if (data.driverType === "115") {
        setQr115Params({
          uid: data.uid,
          time: data.time,
          sign: data.sign,
        });
        setQrImageUrl(data.imageUrl);
      }

      setQrStatus("waiting");
      setQrMessage(data.message || "请扫描二维码");
      toast.info(data.message || "请使用手机 App 扫描二维码");

      // Start polling for QR status
      startQrPolling();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "获取二维码失败");
      setQrStatus("error");
    } finally {
      setQrLoading(false);
    }
  }, [driver]);

  const startQrPolling = useCallback(() => {
    if (!driver) return;
    if (qrPollIntervalRef.current) {
      clearInterval(qrPollIntervalRef.current);
    }

    qrPollIntervalRef.current = setInterval(async () => {
      try {
        let body: Record<string, string> = {};
        if (driver.type === "quark" && qrToken) {
          body = { token: qrToken };
        } else if (driver.type === "115" && qr115Params) {
          body = { uid: qr115Params.uid, time: qr115Params.time, sign: qr115Params.sign };
        } else {
          return;
        }

        const res = await fetch(`/api/drivers/${driver.id}/qr-login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) return;
        const data = await res.json();

        if (data.status === "confirmed") {
          setQrStatus("confirmed");
          setQrMessage("登录成功！");
          if (qrPollIntervalRef.current) {
            clearInterval(qrPollIntervalRef.current);
            qrPollIntervalRef.current = null;
          }
          toast.success(`${visualConfig?.label || "驱动"} 登录成功！`);
          queryClient.invalidateQueries({ queryKey: ["my-drivers"] });
          queryClient.invalidateQueries({ queryKey: ["admin-drivers"] });
          queryClient.invalidateQueries({ queryKey: ["sidebar-drivers"] });
          onAuthorized?.();
        } else if (data.status === "scanned") {
          setQrStatus("scanned");
          setQrMessage("已扫描，请在手机上确认登录");
        } else if (data.status === "expired") {
          setQrStatus("expired");
          setQrMessage("二维码已过期，请重新获取");
          if (qrPollIntervalRef.current) {
            clearInterval(qrPollIntervalRef.current);
            qrPollIntervalRef.current = null;
          }
        } else {
          // still waiting
          setQrStatus("waiting");
        }
      } catch {
        // Ignore polling errors
      }
    }, 2000);
  }, [driver, qrToken, qr115Params, visualConfig, queryClient, onAuthorized]);

  // Refresh QR code
  const handleQrRefresh = useCallback(() => {
    if (qrPollIntervalRef.current) {
      clearInterval(qrPollIntervalRef.current);
      qrPollIntervalRef.current = null;
    }
    handleQrCodeRequest();
  }, [handleQrCodeRequest]);

  if (!driver || !visualConfig) return null;
  const Icon = visualConfig.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center border", visualConfig.bgColor, visualConfig.borderColor)}>
              <Icon className={cn("w-5 h-5", visualConfig.color)} />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="flex items-center gap-2">
                授权 {visualConfig.label}
                {driver.authStatus && <AuthStatusBadge status={driver.authStatus} />}
              </DialogTitle>
              <DialogDescription className="mt-0.5">
                {driver.name}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* ---- OAuth Type ---- */}
          {isOAuth && (
            <div className="space-y-4">
              <Alert className="border-blue-500/20 bg-blue-500/5">
                <Info className="w-4 h-4 text-blue-500" />
                <AlertDescription className="text-sm">
                  点击&quot;前往授权&quot;按钮后，将打开 {visualConfig.label} 的授权页面。
                  请在弹出窗口中登录并授权，完成后此窗口将自动更新状态。
                </AlertDescription>
              </Alert>

              <div className={cn("rounded-lg p-4", visualConfig.bgColor)}>
                <div className="flex items-center gap-3">
                  <ExternalLink className={cn("w-5 h-5", visualConfig.color)} />
                  <div>
                    <p className="text-sm font-medium">OAuth 2.0 安全授权</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      使用行业标准的安全授权协议，无需输入账号密码
                    </p>
                  </div>
                </div>
              </div>

              {oauthPopupOpen && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">等待授权完成...</span>
                </div>
              )}

              <Separator />

              <div className="flex gap-2">
                <Button
                  onClick={handleOAuthAuthorize}
                  disabled={oauthLoading || oauthPopupOpen}
                  className={cn("flex-1 gap-2", visualConfig.color.replace("text-", "bg-").replace(/-\d+$/, "-600"))}
                >
                  {oauthLoading || oauthPopupOpen ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ExternalLink className="w-4 h-4" />
                  )}
                  {oauthPopupOpen ? "等待授权中..." : "前往授权"}
                </Button>
              </div>
            </div>
          )}

          {/* ---- Cookie/QR Type ---- */}
          {isCookie && (
            <Tabs defaultValue="cookie" className="w-full">
              <TabsList className="w-full grid grid-cols-2">
                <TabsTrigger value="cookie" className="gap-1.5">
                  <Cookie className="w-3.5 h-3.5" />
                  Cookie 登录
                </TabsTrigger>
                <TabsTrigger value="qrcode" className="gap-1.5">
                  <QrCode className="w-3.5 h-3.5" />
                  扫码登录
                </TabsTrigger>
              </TabsList>

              {/* Cookie Tab */}
              <TabsContent value="cookie" className="space-y-4 mt-4">
                <Alert className="border-amber-500/20 bg-amber-500/5">
                  <Info className="w-4 h-4 text-amber-500" />
                  <AlertDescription className="text-sm space-y-1.5">
                    <p className="font-medium">如何获取 Cookie？</p>
                    <ol className="list-decimal list-inside text-xs text-muted-foreground space-y-0.5">
                      <li>在浏览器中打开 {visualConfig.label} 并登录</li>
                      <li>按 <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">F12</kbd> 打开开发者工具</li>
                      <li>切换到 <strong>网络 (Network)</strong> 标签</li>
                      <li>刷新页面，点击任意请求</li>
                      <li>在请求头中找到 <code className="px-1 py-0.5 bg-muted rounded text-[10px]">Cookie</code> 字段</li>
                      <li>复制完整的 Cookie 值粘贴到下方</li>
                    </ol>
                  </AlertDescription>
                </Alert>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Cookie 值</label>
                  <Textarea
                    placeholder="粘贴从浏览器获取的 Cookie 值..."
                    value={cookieValue}
                    onChange={(e) => {
                      setCookieValue(e.target.value);
                      setCookieResult("idle");
                    }}
                    className="min-h-[100px] font-mono text-xs"
                  />
                </div>

                {cookieResult === "success" && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-sm font-medium">Cookie 验证成功，驱动已授权！</span>
                  </div>
                )}

                {cookieResult === "error" && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-700 dark:text-red-400">
                    <XCircle className="w-4 h-4" />
                    <span className="text-sm">Cookie 验证失败，请检查 Cookie 是否有效</span>
                  </div>
                )}

                <Button
                  onClick={handleCookieSubmit}
                  disabled={cookieSubmitting || !cookieValue.trim()}
                  className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700"
                >
                  {cookieSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-4 h-4" />
                  )}
                  保存并验证
                </Button>
              </TabsContent>

              {/* QR Code Tab */}
              <TabsContent value="qrcode" className="space-y-4 mt-4">
                {qrStatus === "idle" && !qrImageUrl && (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className={cn("w-20 h-20 rounded-2xl flex items-center justify-center mb-4", visualConfig.bgColor)}>
                      <QrCode className={cn("w-10 h-10", visualConfig.color)} />
                    </div>
                    <p className="text-sm font-medium">扫码快捷登录</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      使用 {visualConfig.label} App 扫描二维码登录
                    </p>
                    <Button
                      onClick={handleQrCodeRequest}
                      disabled={qrLoading}
                      className="mt-4 gap-2 bg-emerald-600 hover:bg-emerald-700"
                    >
                      {qrLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Smartphone className="w-4 h-4" />
                      )}
                      获取二维码
                    </Button>
                  </div>
                )}

                {qrImageUrl && (
                  <div className="flex flex-col items-center space-y-3">
                    <div className="relative p-4 bg-white rounded-xl shadow-sm border">
                      {qrImageUrl.startsWith("http") ? (
                        <img
                          src={qrImageUrl}
                          alt="登录二维码"
                          className="w-48 h-48"
                        />
                      ) : (
                        <div className="w-48 h-48 flex items-center justify-center">
                          <QrCode className="w-32 h-32 text-gray-800" />
                        </div>
                      )}
                      {/* Status overlay */}
                      {(qrStatus === "confirmed" || qrStatus === "expired" || qrStatus === "error") && (
                        <div className="absolute inset-0 rounded-xl bg-black/60 flex flex-col items-center justify-center">
                          {qrStatus === "confirmed" ? (
                            <CheckCircle2 className="w-12 h-12 text-emerald-400" />
                          ) : (
                            <XCircle className="w-12 h-12 text-red-400" />
                          )}
                          <p className="text-white text-sm mt-2 font-medium">
                            {qrStatus === "confirmed" ? "登录成功" : qrStatus === "expired" ? "二维码已过期" : "出错了"}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Status message */}
                    <div className="flex items-center gap-2">
                      {qrStatus === "waiting" && (
                        <>
                          <Clock className="w-4 h-4 text-amber-500" />
                          <span className="text-sm text-amber-600 dark:text-amber-400">等待扫描...</span>
                        </>
                      )}
                      {qrStatus === "scanned" && (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                          <span className="text-sm text-blue-600 dark:text-blue-400">已扫描，请在手机上确认</span>
                        </>
                      )}
                      {qrStatus === "confirmed" && (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          <span className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">登录成功！</span>
                        </>
                      )}
                      {qrStatus === "expired" && (
                        <>
                          <XCircle className="w-4 h-4 text-red-500" />
                          <span className="text-sm text-red-600 dark:text-red-400">二维码已过期</span>
                        </>
                      )}
                    </div>

                    {/* Refresh button */}
                    {(qrStatus === "expired" || qrStatus === "error") && (
                      <Button
                        variant="outline"
                        onClick={handleQrRefresh}
                        className="gap-2"
                      >
                        <RefreshCw className="w-4 h-4" />
                        刷新二维码
                      </Button>
                    )}

                    {/* Initial refresh button while waiting */}
                    {qrStatus === "waiting" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleQrRefresh}
                        className="text-xs text-muted-foreground"
                      >
                        <RefreshCw className="w-3 h-3 mr-1" />
                        刷新二维码
                      </Button>
                    )}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
