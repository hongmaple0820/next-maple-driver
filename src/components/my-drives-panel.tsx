"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Cloud, HardDrive, Globe, Server, Network, Plus, X, RefreshCw,
  ShieldCheck, ShieldAlert, ShieldX, ShieldQuestion, Trash2,
  ExternalLink, Phone, KeyRound, Mail, Loader2, ChevronRight,
  FolderInput, Unplug, CheckCircle2, XCircle, AlertCircle, Folder,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useFileStore } from "@/store/file-store";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DriverAuthorizationDialog } from "@/components/driver-authorization-dialog";

// Driver type visual config
const DRIVER_TYPE_CONFIG: Record<string, {
  icon: typeof Cloud;
  color: string;
  bgColor: string;
  borderColor: string;
  label: string;
  authType: string;
}> = {
  baidu: {
    icon: Cloud,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
    label: "百度网盘",
    authType: "OAuth",
  },
  aliyun: {
    icon: Cloud,
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/20",
    label: "阿里云盘",
    authType: "OAuth",
  },
  onedrive: {
    icon: Cloud,
    color: "text-blue-600",
    bgColor: "bg-blue-600/10",
    borderColor: "border-blue-600/20",
    label: "OneDrive",
    authType: "OAuth",
  },
  google: {
    icon: Cloud,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/20",
    label: "Google Drive",
    authType: "OAuth",
  },
  "115": {
    icon: HardDrive,
    color: "text-amber-600",
    bgColor: "bg-amber-600/10",
    borderColor: "border-amber-600/20",
    label: "115网盘",
    authType: "密码登录",
  },
  quark: {
    icon: HardDrive,
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/20",
    label: "夸克网盘",
    authType: "手机登录",
  },
  webdav: {
    icon: Globe,
    color: "text-teal-500",
    bgColor: "bg-teal-500/10",
    borderColor: "border-teal-500/20",
    label: "WebDAV",
    authType: "配置连接",
  },
  s3: {
    icon: Cloud,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
    label: "S3 存储",
    authType: "配置连接",
  },
  ftp: {
    icon: Globe,
    color: "text-sky-500",
    bgColor: "bg-sky-500/10",
    borderColor: "border-sky-500/20",
    label: "FTP",
    authType: "配置连接",
  },
  local: {
    icon: Server,
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/20",
    label: "本地存储",
    authType: "无需认证",
  },
  mount: {
    icon: Network,
    color: "text-gray-500",
    bgColor: "bg-gray-500/10",
    borderColor: "border-gray-500/20",
    label: "挂载盘",
    authType: "配置连接",
  },
};

function getAuthStatusBadge(authStatus: string) {
  switch (authStatus) {
    case "authorized":
    case "none":
      return (
        <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px] px-1.5 py-0 h-5">
          <ShieldCheck className="w-3 h-3 mr-0.5" />
          已授权
        </Badge>
      );
    case "pending":
      return (
        <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[10px] px-1.5 py-0 h-5">
          <ShieldQuestion className="w-3 h-3 mr-0.5" />
          待授权
        </Badge>
      );
    case "expired":
      return (
        <Badge className="bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20 text-[10px] px-1.5 py-0 h-5">
          <ShieldAlert className="w-3 h-3 mr-0.5" />
          已过期
        </Badge>
      );
    case "error":
      return (
        <Badge className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 text-[10px] px-1.5 py-0 h-5">
          <ShieldX className="w-3 h-3 mr-0.5" />
          错误
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
          {authStatus}
        </Badge>
      );
  }
}

function getAuthStatusDot(authStatus: string) {
  switch (authStatus) {
    case "authorized":
    case "none":
      return "bg-emerald-500";
    case "pending":
      return "bg-amber-500";
    case "expired":
      return "bg-orange-500";
    case "error":
      return "bg-red-500";
    default:
      return "bg-gray-400";
  }
}

// Add Drive Dialog Component
function AddDriveDialog({
  open,
  onOpenChange,
  driverType,
  onDriverCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverType: string | null;
  onDriverCreated?: (driver: { id: string; name: string; type: string; status: string; authType: string; authStatus: string }) => void;
}) {
  const queryClient = useQueryClient();
  const config = driverType ? DRIVER_TYPE_CONFIG[driverType] : null;

  // Form state
  const [name, setName] = useState("");
  const [mountPath, setMountPath] = useState("");
  const [configFields, setConfigFields] = useState<Record<string, string>>({});
  const [quarkPhone, setQuarkPhone] = useState("");
  const [quarkPassword, setQuarkPassword] = useState("");
  const [quarkSmsCode, setQuarkSmsCode] = useState("");
  const [quarkAuthMode, setQuarkAuthMode] = useState<"password" | "sms">("password");
  const [account115, setAccount115] = useState("");
  const [password115, setPassword115] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingSms, setIsSendingSms] = useState(false);
  const [createdDriverId, setCreatedDriverId] = useState<string | null>(null);

  // Fetch driver type config fields from API
  const { data: driverTypesData } = useQuery({
    queryKey: ["driver-types"],
    queryFn: async () => {
      const res = await fetch("/api/drivers/types");
      if (!res.ok) throw new Error("Failed to fetch driver types");
      return res.json();
    },
    enabled: open,
  });

  const currentTypeConfig = driverTypesData?.driverTypes?.find(
    (t: { type: string }) => t.type === driverType
  );

  const isOAuth = driverType && ["baidu", "aliyun", "onedrive", "google"].includes(driverType);
  const isQuark = driverType === "quark";
  const is115 = driverType === "115";
  const isConfigType = driverType && ["webdav", "s3", "ftp", "local", "mount"].includes(driverType);

  // Reset form when dialog opens/closes or type changes
  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (!newOpen) {
      setName("");
      setMountPath("");
      setConfigFields({});
      setQuarkPhone("");
      setQuarkPassword("");
      setQuarkSmsCode("");
      setQuarkAuthMode("password");
      setAccount115("");
      setPassword115("");
      setCreatedDriverId(null);
    }
    onOpenChange(newOpen);
  }, [onOpenChange]);

  // Create driver mutation
  const createDriverMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      type: string;
      config: Record<string, string>;
      mountPath: string;
    }) => {
      const res = await fetch("/api/drivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error || "Failed to create driver");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setCreatedDriverId(data.id);
      toast.success(`驱动 "${name}" 创建成功`);
      onDriverCreated?.(data);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Authorize mutation
  const authorizeMutation = useMutation({
    mutationFn: async ({
      driverId,
      credentials,
    }: {
      driverId: string;
      credentials?: Record<string, string>;
    }) => {
      const res = await fetch(`/api/drivers/${driverId}/authorize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials || {}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Authorization failed" }));
        throw new Error(err.error || "Authorization failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.authorizationUrl) {
        // OAuth - redirect
        window.open(data.authorizationUrl, "_blank", "width=600,height=700");
        toast.info("请在弹出窗口中完成授权");
      } else {
        toast.success("登录成功！");
        queryClient.invalidateQueries({ queryKey: ["my-drivers"] });
        queryClient.invalidateQueries({ queryKey: ["sidebar-drivers"] });
        queryClient.invalidateQueries({ queryKey: ["vfs-mounts"] });
        handleOpenChange(false);
      }
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Send SMS code mutation
  const sendSmsMutation = useMutation({
    mutationFn: async ({ driverId, phone }: { driverId: string; phone: string }) => {
      const res = await fetch(`/api/drivers/${driverId}/sms-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error || "Failed to send SMS code");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("验证码已发送");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = useCallback(async () => {
    if (!driverType || !name.trim()) {
      toast.error("请填写驱动名称");
      return;
    }

    setIsSubmitting(true);

    try {
      // Build config object
      const driverConfig: Record<string, string> = { ...configFields };

      // Add type-specific fields
      if (isQuark) {
        driverConfig.phone = quarkPhone;
        if (quarkAuthMode === "password") driverConfig.password = quarkPassword;
        if (quarkAuthMode === "sms") driverConfig.smsCode = quarkSmsCode;
      }
      if (is115) {
        driverConfig.username = account115;
        driverConfig.password = password115;
      }

      // Create the driver first
      const result = await createDriverMutation.mutateAsync({
        name: name.trim(),
        type: driverType,
        config: driverConfig,
        mountPath: mountPath.trim() || `/${driverType}`,
      });

      // Then authorize if needed
      if (isOAuth) {
        authorizeMutation.mutate({ driverId: result.id });
      } else if (isQuark) {
        const creds: Record<string, string> = { phone: quarkPhone };
        if (quarkAuthMode === "password") creds.password = quarkPassword;
        if (quarkAuthMode === "sms") creds.smsCode = quarkSmsCode;
        authorizeMutation.mutate({ driverId: result.id, credentials: creds });
      } else if (is115) {
        authorizeMutation.mutate({
          driverId: result.id,
          credentials: { username: account115, password: password115 },
        });
      } else {
        // Config-only types (WebDAV, S3, FTP, Local) - no auth needed
        queryClient.invalidateQueries({ queryKey: ["my-drivers"] });
        queryClient.invalidateQueries({ queryKey: ["sidebar-drivers"] });
        queryClient.invalidateQueries({ queryKey: ["vfs-mounts"] });
        handleOpenChange(false);
      }
    } catch {
      // Error already handled by mutation
    } finally {
      setIsSubmitting(false);
    }
  }, [
    driverType, name, mountPath, configFields, isOAuth, isQuark, is115,
    quarkPhone, quarkPassword, quarkSmsCode, quarkAuthMode, account115, password115,
    createDriverMutation, authorizeMutation, queryClient, handleOpenChange,
  ]);

  const handleSendSms = useCallback(async () => {
    if (!createdDriverId && !quarkPhone) {
      toast.error("请先填写手机号");
      return;
    }

    setIsSendingSms(true);
    try {
      // If driver hasn't been created yet, we need to create it first without auth
      if (!createdDriverId) {
        const result = await createDriverMutation.mutateAsync({
          name: name.trim(),
          type: "quark",
          config: { phone: quarkPhone },
          mountPath: mountPath.trim() || "/quark",
        });
        setCreatedDriverId(result.id);
        await sendSmsMutation.mutateAsync({ driverId: result.id, phone: quarkPhone });
      } else {
        await sendSmsMutation.mutateAsync({ driverId: createdDriverId, phone: quarkPhone });
      }
    } catch {
      // Error handled by mutation
    } finally {
      setIsSendingSms(false);
    }
  }, [createdDriverId, quarkPhone, name, mountPath, createDriverMutation, sendSmsMutation]);

  if (!config) return null;

  const Icon = config.icon;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", config.bgColor, config.borderColor, "border")}>
              <Icon className={cn("w-5 h-5", config.color)} />
            </div>
            <div>
              <DialogTitle>添加 {config.label}</DialogTitle>
              <DialogDescription>
                {isOAuth
                  ? "通过 OAuth 授权绑定您的云盘账号"
                  : isQuark
                  ? "通过手机号登录夸克网盘"
                  : is115
                  ? "通过账号密码登录115网盘"
                  : "配置连接参数以添加存储驱动"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name input */}
          <div className="space-y-2">
            <label className="text-sm font-medium">驱动名称</label>
            <Input
              placeholder={`例如: 我的${config.label}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Mount Path input */}
          <div className="space-y-2">
            <label className="text-sm font-medium">挂载路径</label>
            <Input
              placeholder={`/${driverType}`}
              value={mountPath}
              onChange={(e) => setMountPath(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">文件浏览器中的虚拟路径</p>
          </div>

          <Separator />

          {/* OAuth types - show authorize button */}
          {isOAuth && !createdDriverId && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                点击&quot;创建并授权&quot;后，将跳转到 {config.label} 授权页面完成绑定。
              </p>
              <div className={cn("rounded-lg p-3", config.bgColor)}>
                <div className="flex items-center gap-2 text-sm">
                  <ExternalLink className={cn("w-4 h-4", config.color)} />
                  <span>将使用 OAuth 2.0 安全授权</span>
                </div>
              </div>
            </div>
          )}

          {/* OAuth - show re-auth button after creation */}
          {isOAuth && createdDriverId && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-emerald-600">
                <CheckCircle2 className="w-4 h-4" />
                <span>驱动已创建，正在打开授权页面...</span>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() =>
                  authorizeMutation.mutate({ driverId: createdDriverId })
                }
                disabled={authorizeMutation.isPending}
              >
                {authorizeMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <ExternalLink className="w-4 h-4 mr-2" />
                )}
                重新授权
              </Button>
            </div>
          )}

          {/* Quark login form */}
          {isQuark && (
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">手机号</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="请输入手机号"
                    value={quarkPhone}
                    onChange={(e) => setQuarkPhone(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              {/* Auth mode toggle */}
              <div className="flex gap-1 p-1 bg-muted/50 rounded-lg">
                <button
                  className={cn(
                    "flex-1 text-xs py-1.5 rounded-md transition-all",
                    quarkAuthMode === "password"
                      ? "bg-background shadow-sm font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => setQuarkAuthMode("password")}
                >
                  <KeyRound className="w-3 h-3 inline mr-1" />
                  密码登录
                </button>
                <button
                  className={cn(
                    "flex-1 text-xs py-1.5 rounded-md transition-all",
                    quarkAuthMode === "sms"
                      ? "bg-background shadow-sm font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => setQuarkAuthMode("sms")}
                >
                  <Mail className="w-3 h-3 inline mr-1" />
                  短信验证码
                </button>
              </div>

              {quarkAuthMode === "password" ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium">密码</label>
                  <Input
                    type="password"
                    placeholder="请输入密码"
                    value={quarkPassword}
                    onChange={(e) => setQuarkPassword(e.target.value)}
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-medium">验证码</label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="请输入验证码"
                      value={quarkSmsCode}
                      onChange={(e) => setQuarkSmsCode(e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSendSms}
                      disabled={isSendingSms || !quarkPhone}
                      className="shrink-0"
                    >
                      {isSendingSms ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        "发送验证码"
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 115 login form */}
          {is115 && (
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">账号</label>
                <Input
                  placeholder="请输入115账号"
                  value={account115}
                  onChange={(e) => setAccount115(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">密码</label>
                <Input
                  type="password"
                  placeholder="请输入密码"
                  value={password115}
                  onChange={(e) => setPassword115(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Config-based types - dynamic config fields */}
          {isConfigType && currentTypeConfig && (
            <div className="space-y-3">
              {currentTypeConfig.configFields.map(
                (field: {
                  key: string;
                  label: string;
                  type: string;
                  required: boolean;
                  placeholder: string | null;
                  helpText: string | null;
                  defaultValue: string | null;
                }) => (
                  <div key={field.key} className="space-y-1.5">
                    <label className="text-sm font-medium">
                      {field.label}
                      {field.required && <span className="text-red-500 ml-0.5">*</span>}
                    </label>
                    <Input
                      type={field.type === "password" ? "password" : "text"}
                      placeholder={field.placeholder || ""}
                      value={configFields[field.key] || field.defaultValue || ""}
                      onChange={(e) =>
                        setConfigFields((prev) => ({
                          ...prev,
                          [field.key]: e.target.value,
                        }))
                      }
                    />
                    {field.helpText && (
                      <p className="text-xs text-muted-foreground">{field.helpText}</p>
                    )}
                  </div>
                )
              )}
            </div>
          )}

          {/* Config-based types - fallback if API data not loaded yet */}
          {isConfigType && !currentTypeConfig && (
            <div className="space-y-3">
              {driverType === "webdav" && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">服务器地址 <span className="text-red-500">*</span></label>
                    <Input
                      placeholder="https://dav.example.com"
                      value={configFields.url || ""}
                      onChange={(e) => setConfigFields((p) => ({ ...p, url: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">用户名</label>
                    <Input
                      placeholder="username"
                      value={configFields.username || ""}
                      onChange={(e) => setConfigFields((p) => ({ ...p, username: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">密码</label>
                    <Input
                      type="password"
                      placeholder="password"
                      value={configFields.password || ""}
                      onChange={(e) => setConfigFields((p) => ({ ...p, password: e.target.value }))}
                    />
                  </div>
                </>
              )}
              {driverType === "s3" && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Endpoint <span className="text-red-500">*</span></label>
                    <Input
                      placeholder="https://s3.amazonaws.com"
                      value={configFields.endpoint || ""}
                      onChange={(e) => setConfigFields((p) => ({ ...p, endpoint: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Bucket <span className="text-red-500">*</span></label>
                    <Input
                      placeholder="my-bucket"
                      value={configFields.bucket || ""}
                      onChange={(e) => setConfigFields((p) => ({ ...p, bucket: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Access Key</label>
                    <Input
                      placeholder="AKIAIOSFODNN7EXAMPLE"
                      value={configFields.accessKeyId || ""}
                      onChange={(e) => setConfigFields((p) => ({ ...p, accessKeyId: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Secret Key</label>
                    <Input
                      type="password"
                      placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                      value={configFields.secretAccessKey || ""}
                      onChange={(e) => setConfigFields((p) => ({ ...p, secretAccessKey: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Region</label>
                    <Input
                      placeholder="us-east-1"
                      value={configFields.region || ""}
                      onChange={(e) => setConfigFields((p) => ({ ...p, region: e.target.value }))}
                    />
                  </div>
                </>
              )}
              {driverType === "ftp" && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">主机地址 <span className="text-red-500">*</span></label>
                    <Input
                      placeholder="ftp.example.com"
                      value={configFields.host || ""}
                      onChange={(e) => setConfigFields((p) => ({ ...p, host: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">端口</label>
                    <Input
                      placeholder="21"
                      value={configFields.port || "21"}
                      onChange={(e) => setConfigFields((p) => ({ ...p, port: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">用户名</label>
                    <Input
                      placeholder="username"
                      value={configFields.username || ""}
                      onChange={(e) => setConfigFields((p) => ({ ...p, username: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">密码</label>
                    <Input
                      type="password"
                      placeholder="password"
                      value={configFields.password || ""}
                      onChange={(e) => setConfigFields((p) => ({ ...p, password: e.target.value }))}
                    />
                  </div>
                </>
              )}
              {driverType === "local" && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">存储路径</label>
                  <Input
                    placeholder="./storage"
                    value={configFields.path || ""}
                    onChange={(e) => setConfigFields((p) => ({ ...p, path: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">服务器上的本地文件系统路径</p>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              isSubmitting ||
              createDriverMutation.isPending ||
              authorizeMutation.isPending ||
              !name.trim()
            }
            className={cn(
              "gap-2",
              config.color.replace("text-", "bg-").replace(/-\d+$/, "-600")
            )}
          >
            {(isSubmitting || createDriverMutation.isPending || authorizeMutation.isPending) && (
              <Loader2 className="w-4 h-4 animate-spin" />
            )}
            {isOAuth
              ? "创建并授权"
              : isQuark || is115
              ? "创建并登录"
              : "创建驱动"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MyDrivesPanel() {
  const { myDrivesOpen, setMyDrivesOpen } = useFileStore();
  const queryClient = useQueryClient();

  // State for add drive dialog
  const [addDriveType, setAddDriveType] = useState<string | null>(null);
  const [addDriveOpen, setAddDriveOpen] = useState(false);

  // State for authorization dialog
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [authDriver, setAuthDriver] = useState<{
    id: string;
    name: string;
    type: string;
    status: string;
    authType: string;
    authStatus: string;
    config?: string;
    mountPath?: string;
  } | null>(null);

  // Fetch user's drivers
  const {
    data: driversData,
    isLoading: driversLoading,
  } = useQuery({
    queryKey: ["my-drivers"],
    queryFn: async () => {
      const res = await fetch("/api/drivers");
      if (!res.ok) throw new Error("Failed to fetch drivers");
      return res.json();
    },
    refetchInterval: 30000,
  });

  // Fetch driver types
  const { data: typesData } = useQuery({
    queryKey: ["driver-types"],
    queryFn: async () => {
      const res = await fetch("/api/drivers/types");
      if (!res.ok) throw new Error("Failed to fetch driver types");
      return res.json();
    },
  });

  const drivers: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    mountPath: string;
    authType: string;
    authStatus: string;
    isDefault: boolean;
    isReadOnly: boolean;
  }> = driversData?.drivers || [];

  const driverTypes: Array<{
    type: string;
    displayName: string;
    description: string;
    authType: string;
    configFields: Array<{
      key: string;
      label: string;
      type: string;
      required: boolean;
    }>;
  }> = typesData?.driverTypes || [];

  // Delete driver mutation
  const deleteDriverMutation = useMutation({
    mutationFn: async (driverId: string) => {
      const res = await fetch(`/api/drivers/${driverId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error || "Failed to delete driver");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("驱动已删除");
      queryClient.invalidateQueries({ queryKey: ["my-drivers"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-drivers"] });
      queryClient.invalidateQueries({ queryKey: ["vfs-mounts"] });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Health check mutation
  const healthCheckMutation = useMutation({
    mutationFn: async (driverId: string) => {
      const res = await fetch(`/api/drivers/${driverId}/health`);
      if (!res.ok) throw new Error("Health check failed");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.healthy) {
        toast.success("驱动状态正常", {
          description: `响应时间: ${data.responseTime}ms`,
        });
      } else {
        toast.warning("驱动状态异常", { description: data.message });
      }
      queryClient.invalidateQueries({ queryKey: ["my-drivers"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-drivers"] });
    },
    onError: () => {
      toast.error("健康检查失败");
    },
  });

  // Re-authorize mutation
  const reauthMutation = useMutation({
    mutationFn: async (driverId: string) => {
      const res = await fetch(`/api/drivers/${driverId}/authorize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Authorization failed" }));
        throw new Error(err.error || "Authorization failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.authorizationUrl) {
        window.open(data.authorizationUrl, "_blank", "width=600,height=700");
        toast.info("请在弹出窗口中完成授权");
      } else {
        toast.success("重新授权成功");
        queryClient.invalidateQueries({ queryKey: ["my-drivers"] });
        queryClient.invalidateQueries({ queryKey: ["sidebar-drivers"] });
      }
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // De-authorize mutation
  const deauthMutation = useMutation({
    mutationFn: async (driverId: string) => {
      const res = await fetch(`/api/drivers/${driverId}/authorize`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to de-authorize");
      return res.json();
    },
    onSuccess: () => {
      toast.success("已取消授权");
      queryClient.invalidateQueries({ queryKey: ["my-drivers"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-drivers"] });
    },
    onError: () => {
      toast.error("取消授权失败");
    },
  });

  const handleAddDrive = useCallback((type: string) => {
    setAddDriveType(type);
    setAddDriveOpen(true);
  }, []);

  const handleAuthorize = useCallback((driver: {
    id: string;
    name: string;
    type: string;
    status: string;
    authType: string;
    authStatus: string;
    config?: string;
    mountPath?: string;
  }) => {
    setAuthDriver(driver);
    setAuthDialogOpen(true);
  }, []);

  const nonDefaultDrivers = drivers.filter((d) => !d.isDefault);
  const defaultDriver = drivers.find((d) => d.isDefault);

  return (
    <>
      <Sheet open={myDrivesOpen} onOpenChange={setMyDrivesOpen}>
        <SheetContent side="right" className="w-[420px] sm:w-[480px] p-0">
          <SheetTitle className="sr-only">我的驱动</SheetTitle>
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
              <div className="flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <h2 className="text-lg font-semibold">我的驱动</h2>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setMyDrivesOpen(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <ScrollArea className="flex-1">
              <div className="px-6 py-4 space-y-6">
                {/* Available Drive Types */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    可用驱动类型
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {/* Show driver types from API, or fallback to static list */}
                    {(driverTypes.length > 0
                      ? driverTypes.filter((t) => t.type !== "local" && t.type !== "mount")
                      : Object.entries(DRIVER_TYPE_CONFIG)
                          .filter(([key]) => key !== "local" && key !== "mount")
                          .map(([key, cfg]) => ({
                            type: key,
                            displayName: cfg.label,
                            description: "",
                            authType: cfg.authType,
                            configFields: [],
                          }))
                    ).map((typeInfo) => {
                      const cfg = DRIVER_TYPE_CONFIG[typeInfo.type] || {
                        icon: Cloud,
                        color: "text-gray-500",
                        bgColor: "bg-gray-500/10",
                        borderColor: "border-gray-500/20",
                      };
                      const Icon = cfg.icon;
                      return (
                        <motion.button
                          key={typeInfo.type}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => handleAddDrive(typeInfo.type)}
                          className={cn(
                            "flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all cursor-pointer",
                            "hover:shadow-md hover:border-emerald-500/30",
                            cfg.bgColor, cfg.borderColor
                          )}
                        >
                          <Icon className={cn("w-6 h-6", cfg.color)} />
                          <span className="text-xs font-medium">{typeInfo.displayName}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {typeInfo.authType === "oauth"
                              ? "OAuth"
                              : typeInfo.authType === "password"
                              ? "密码登录"
                              : typeInfo.authType === "sms"
                              ? "短信登录"
                              : typeInfo.authType === "none"
                              ? "无需认证"
                              : "配置连接"}
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                <Separator />

                {/* My Bound Drives */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    已绑定的驱动
                  </h3>

                  {driversLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div
                          key={i}
                          className="h-20 rounded-xl bg-muted/30 animate-pulse"
                        />
                      ))}
                    </div>
                  ) : drivers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <HardDrive className="w-10 h-10 mb-2 opacity-30" />
                      <p className="text-sm">暂无驱动</p>
                      <p className="text-xs mt-1">点击上方驱动类型添加</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {/* Default driver */}
                      {defaultDriver && (
                        <DriverCard
                          driver={defaultDriver}
                          isDefault
                          onHealthCheck={(id) => healthCheckMutation.mutate(id)}
                          healthCheckLoading={healthCheckMutation.isPending}
                          onReauth={(id) => reauthMutation.mutate(id)}
                          reauthLoading={reauthMutation.isPending}
                          onDelete={(id) => deleteDriverMutation.mutate(id)}
                          deleteLoading={deleteDriverMutation.isPending}
                          onDeauth={(id) => deauthMutation.mutate(id)}
                          onAuthorize={handleAuthorize}
                        />
                      )}

                      {/* User-added drivers */}
                      <AnimatePresence>
                        {nonDefaultDrivers.map((driver, index) => (
                          <motion.div
                            key={driver.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ delay: index * 0.05 }}
                          >
                            <DriverCard
                              driver={driver}
                              onHealthCheck={(id) => healthCheckMutation.mutate(id)}
                              healthCheckLoading={healthCheckMutation.isPending}
                              onReauth={(id) => reauthMutation.mutate(id)}
                              reauthLoading={reauthMutation.isPending}
                              onDelete={(id) => deleteDriverMutation.mutate(id)}
                              deleteLoading={deleteDriverMutation.isPending}
                              onDeauth={(id) => deauthMutation.mutate(id)}
                              onAuthorize={handleAuthorize}
                            />
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>

            {/* Footer */}
            <div className="border-t border-border/50 px-6 py-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{drivers.length} 个驱动</span>
                <span>{nonDefaultDrivers.filter((d) => d.authStatus === "authorized").length} 个已授权</span>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Add Drive Dialog */}
      <AddDriveDialog
        open={addDriveOpen}
        onOpenChange={setAddDriveOpen}
        driverType={addDriveType}
        onDriverCreated={(createdDriver) => {
          // For cloud driver types that need auth, open the authorization dialog
          const isOAuthType = ["baidu", "aliyun", "onedrive", "google"].includes(createdDriver.type);
          const isCookieType = ["115", "quark"].includes(createdDriver.type);
          if (isOAuthType || isCookieType) {
            setAuthDriver({
              id: createdDriver.id,
              name: createdDriver.name,
              type: createdDriver.type,
              status: createdDriver.status || "active",
              authType: createdDriver.authType || (isOAuthType ? "oauth" : "password"),
              authStatus: createdDriver.authStatus || "pending",
            });
            setAddDriveOpen(false);
            setTimeout(() => setAuthDialogOpen(true), 300);
          }
        }}
      />

      {/* Driver Authorization Dialog */}
      <DriverAuthorizationDialog
        open={authDialogOpen}
        onOpenChange={setAuthDialogOpen}
        driver={authDriver}
        onAuthorized={() => {
          queryClient.invalidateQueries({ queryKey: ["my-drivers"] });
          queryClient.invalidateQueries({ queryKey: ["sidebar-drivers"] });
        }}
      />
    </>
  );
}

// Individual driver card in the panel
function DriverCard({
  driver,
  isDefault = false,
  onHealthCheck,
  healthCheckLoading,
  onReauth,
  reauthLoading,
  onDelete,
  deleteLoading,
  onDeauth,
  onAuthorize,
}: {
  driver: {
    id: string;
    name: string;
    type: string;
    status: string;
    mountPath: string;
    authType: string;
    authStatus: string;
    isDefault: boolean;
    isReadOnly: boolean;
  };
  isDefault?: boolean;
  onHealthCheck: (id: string) => void;
  healthCheckLoading: boolean;
  onReauth: (id: string) => void;
  reauthLoading: boolean;
  onDelete: (id: string) => void;
  deleteLoading: boolean;
  onDeauth: (id: string) => void;
  onAuthorize?: (driver: {
    id: string;
    name: string;
    type: string;
    status: string;
    authType: string;
    authStatus: string;
    config?: string;
    mountPath?: string;
  }) => void;
}) {
  const { browseDriver, setMyDrivesOpen } = useFileStore();
  const [showActions, setShowActions] = useState(false);
  const cfg = DRIVER_TYPE_CONFIG[driver.type] || {
    icon: Cloud,
    color: "text-gray-500",
    bgColor: "bg-gray-500/10",
    borderColor: "border-gray-500/20",
    label: driver.type,
  };
  const Icon = cfg.icon;

  const needsAuth =
    driver.authType === "oauth" ||
    driver.authType === "password" ||
    driver.authType === "sms";

  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-all",
        driver.authStatus === "authorized" || driver.authStatus === "none"
          ? "border-border/50 bg-card"
          : driver.authStatus === "expired"
          ? "border-orange-500/30 bg-orange-500/5"
          : driver.authStatus === "error"
          ? "border-red-500/30 bg-red-500/5"
          : "border-amber-500/30 bg-amber-500/5"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", cfg.bgColor)}>
          <Icon className={cn("w-5 h-5", cfg.color)} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{driver.name}</span>
            {isDefault && (
              <Badge variant="secondary" className="text-[9px] h-4 px-1 shrink-0">
                默认
              </Badge>
            )}
            {driver.isReadOnly && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge className="text-[9px] h-4 px-1 bg-amber-500/10 text-amber-600 border-amber-500/20 shrink-0">
                    <Unplug className="w-2.5 h-2.5 mr-0.5" />
                    只读
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>此驱动为只读模式</TooltipContent>
              </Tooltip>
            )}
          </div>

          <div className="flex items-center gap-2 mt-1">
            {getAuthStatusBadge(driver.authStatus)}
            {driver.mountPath && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                <FolderInput className="w-2.5 h-2.5" />
                {driver.mountPath}
              </span>
            )}
          </div>
        </div>

        {/* Actions toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={() => setShowActions(!showActions)}
        >
          <ChevronRight
            className={cn(
              "w-4 h-4 transition-transform",
              showActions && "rotate-90"
            )}
          />
        </Button>
      </div>

      {/* Expanded actions */}
      <AnimatePresence>
        {showActions && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap gap-1.5 pt-3 mt-3 border-t border-border/30">
              {/* Browse Files */}
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
                onClick={() => {
                  browseDriver(driver.id, driver.name, driver.type, driver.mountPath || `/${driver.type}`);
                  setMyDrivesOpen(false);
                }}
              >
                <Folder className="w-3.5 h-3.5 mr-1.5" />
                浏览文件
              </Button>

              {/* Re-authorize / Authorize */}
              {needsAuth && !isDefault && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => {
                    if (onAuthorize) {
                      onAuthorize(driver);
                    } else {
                      onReauth(driver.id);
                    }
                  }}
                  disabled={reauthLoading}
                >
                  {reauthLoading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : driver.authStatus === "pending" || driver.authStatus === "expired" || driver.authStatus === "error" ? (
                    <ShieldCheck className="w-3 h-3" />
                  ) : (
                    <RefreshCw className="w-3 h-3" />
                  )}
                  {driver.authStatus === "pending" || driver.authStatus === "expired" || driver.authStatus === "error" ? "去授权" : "重新授权"}
                </Button>
              )}

              {/* Health Check */}
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => onHealthCheck(driver.id)}
                disabled={healthCheckLoading}
              >
                {healthCheckLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3 h-3" />
                )}
                健康检查
              </Button>

              {/* De-authorize */}
              {needsAuth && driver.authStatus === "authorized" && !isDefault && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1 text-amber-600 hover:text-amber-700"
                  onClick={() => onDeauth(driver.id)}
                >
                  <AlertCircle className="w-3 h-3" />
                  取消授权
                </Button>
              )}

              {/* Unbind/Delete */}
              {!isDefault && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1 text-red-600 hover:text-red-700 hover:bg-red-500/10"
                  onClick={() => onDelete(driver.id)}
                  disabled={deleteLoading}
                >
                  {deleteLoading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Trash2 className="w-3 h-3" />
                  )}
                  解绑
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
