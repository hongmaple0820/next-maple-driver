"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  HardDrive, Plus, Trash2, CheckCircle2, XCircle, Settings2,
  Cloud, Globe, Server, TestTube, Loader2, ShieldCheck, ShieldAlert,
  ShieldX, Clock, Key, ExternalLink, RefreshCw, Smartphone, Network,
  Info, X, FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { formatFileSize } from "@/lib/file-utils";
import { motion, AnimatePresence } from "framer-motion";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface DriverInfo {
  id: string;
  name: string;
  type: string;
  status: string;
  priority: number;
  isDefault: boolean;
  basePath: string;
  config: string;
  mountPath?: string;
  isReadOnly?: boolean;
  healthy?: boolean;
  createdAt?: string;
  updatedAt?: string;
  // Cloud driver auth fields
  authType?: string;
  authStatus?: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  tokenExpiresAt?: string | null;
  lastSyncAt?: string | null;
}

// Cloud drive type definitions for categorization
const OAUTH_DRIVER_TYPES = ["baidu", "aliyun", "onedrive", "google"] as const;
const PASSWORD_DRIVER_TYPES = ["115", "quark"] as const;

function isOAuthDriver(type: string): boolean {
  return (OAUTH_DRIVER_TYPES as readonly string[]).includes(type);
}

function isPasswordDriver(type: string): boolean {
  return (PASSWORD_DRIVER_TYPES as readonly string[]).includes(type);
}

function isCloudDriver(type: string): boolean {
  return isOAuthDriver(type) || isPasswordDriver(type);
}

const driverTypeIcons: Record<string, typeof Server> = {
  local: Server,
  webdav: Globe,
  s3: Cloud,
  mount: Network,
  ftp: Globe,
  baidu: Cloud,
  aliyun: Cloud,
  onedrive: Cloud,
  google: Cloud,
  "115": HardDrive,
  quark: HardDrive,
};

// Config field definitions per driver type
const driverConfigFields: Record<string, {
  key: string;
  label: string;
  type: "text" | "password" | "url" | "number";
  placeholder: string;
  required: boolean;
  helpText?: string;
}[]> = {
  local: [
    { key: "path", label: "Storage Path", type: "text", placeholder: "./storage", required: true, helpText: "Absolute or relative path to storage directory" },
  ],
  s3: [
    { key: "endpoint", label: "Endpoint URL", type: "url", placeholder: "https://s3.amazonaws.com", required: false, helpText: "Leave empty for AWS S3. Set for MinIO, etc." },
    { key: "region", label: "Region", type: "text", placeholder: "us-east-1", required: true },
    { key: "bucket", label: "Bucket Name", type: "text", placeholder: "my-clouddrive-bucket", required: true },
    { key: "accessKeyId", label: "Access Key ID", type: "text", placeholder: "AKIAIOSFODNN7EXAMPLE", required: true },
    { key: "secretAccessKey", label: "Secret Access Key", type: "password", placeholder: "wJalrXUtnFEMI/K7MDENG/...", required: true },
    { key: "pathPrefix", label: "Path Prefix", type: "text", placeholder: "clouddrive", required: false, helpText: "Optional prefix for all files" },
    { key: "forcePathStyle", label: "Force Path Style", type: "text", placeholder: "true", required: false, helpText: "Enable for MinIO (set to 'true')" },
  ],
  webdav: [
    { key: "url", label: "Server URL", type: "url", placeholder: "https://nextcloud.example.com/remote.php/dav/files/user/", required: true, helpText: "Full WebDAV endpoint URL" },
    { key: "username", label: "Username", type: "text", placeholder: "user@example.com", required: true },
    { key: "password", label: "Password / App Password", type: "password", placeholder: "••••••••", required: true, helpText: "Use app-specific password if 2FA enabled" },
    { key: "pathPrefix", label: "Path Prefix", type: "text", placeholder: "clouddrive", required: false, helpText: "Optional subdirectory within WebDAV root" },
  ],
  baidu: [
    { key: "clientId", label: "Client ID (App Key)", type: "text", placeholder: "GyGxV3bWrAFn4WSy", required: true, helpText: "百度开放平台应用的 App Key" },
    { key: "clientSecret", label: "Client Secret (Secret Key)", type: "password", placeholder: "••••••••", required: true, helpText: "百度开放平台应用的 Secret Key" },
    { key: "redirectUri", label: "Redirect URI", type: "url", placeholder: "https://your-domain.com/api/auth/cloud-oauth/callback", required: false, helpText: "OAuth 回调地址（留空使用默认值）" },
    { key: "refreshToken", label: "Refresh Token", type: "password", placeholder: "已授权的 refresh token", required: false, helpText: "如已有 refresh token 可直接填入，否则通过 OAuth 授权获取" },
  ],
  aliyun: [
    { key: "clientId", label: "Client ID", type: "text", placeholder: "your-client-id", required: true, helpText: "阿里云盘开放平台应用的 Client ID" },
    { key: "clientSecret", label: "Client Secret", type: "password", placeholder: "••••••••", required: true, helpText: "阿里云盘开放平台应用的 Client Secret" },
    { key: "redirectUri", label: "Redirect URI", type: "url", placeholder: "https://your-domain.com/api/auth/cloud-oauth/callback", required: false, helpText: "OAuth 回调地址（留空使用默认值）" },
    { key: "refreshToken", label: "Refresh Token", type: "password", placeholder: "已授权的 refresh token", required: false, helpText: "如已有 refresh token 可直接填入" },
  ],
  onedrive: [
    { key: "clientId", label: "Client ID (Application ID)", type: "text", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", required: true, helpText: "Azure AD application's Application (client) ID" },
    { key: "clientSecret", label: "Client Secret", type: "password", placeholder: "••••••••", required: true, helpText: "Azure AD application's client secret value" },
    { key: "tenantId", label: "Tenant ID", type: "text", placeholder: "common", required: false, helpText: "Use 'common' for all account types, 'consumers' for personal, 'organizations' for work/school, or a specific tenant GUID" },
    { key: "redirectUri", label: "Redirect URI", type: "url", placeholder: "https://your-domain.com/api/auth/cloud-oauth/callback", required: false, helpText: "OAuth callback URL (leave empty for default)" },
    { key: "refreshToken", label: "Refresh Token", type: "password", placeholder: "Existing refresh token", required: false, helpText: "If you already have a refresh token, enter it here" },
  ],
  google: [
    { key: "clientId", label: "Client ID", type: "text", placeholder: "xxxxxxxxxxxx.apps.googleusercontent.com", required: true, helpText: "Google Cloud Console OAuth 2.0 Client ID" },
    { key: "clientSecret", label: "Client Secret", type: "password", placeholder: "GOCSPX-xxxxxxxxxxxx", required: true, helpText: "Google Cloud Console OAuth 2.0 Client Secret" },
    { key: "redirectUri", label: "Redirect URI", type: "url", placeholder: "https://your-domain.com/api/auth/cloud-oauth/callback", required: false, helpText: "OAuth callback URL (leave empty for default)" },
    { key: "refreshToken", label: "Refresh Token", type: "password", placeholder: "Existing refresh token", required: false, helpText: "If you already have a refresh token, enter it here" },
  ],
  "115": [
    { key: "username", label: "账号", type: "text", placeholder: "手机号或邮箱", required: true, helpText: "115网盘登录账号" },
    { key: "password", label: "密码", type: "password", placeholder: "••••••••", required: true, helpText: "115网盘登录密码" },
    { key: "cookies", label: "Cookies（可选）", type: "password", placeholder: "已有的登录 cookies", required: false, helpText: "如已有 cookies 可直接填入，避免重复登录" },
  ],
  quark: [
    { key: "phone", label: "手机号", type: "text", placeholder: "13800138000", required: true, helpText: "夸克网盘注册手机号" },
    { key: "password", label: "密码（可选）", type: "password", placeholder: "••••••••", required: false, helpText: "夸克网盘登录密码，如使用短信验证码登录可不填" },
    { key: "smsCode", label: "短信验证码（可选）", type: "text", placeholder: "123456", required: false, helpText: "短信验证码，点击「发送验证码」获取" },
    { key: "cookies", label: "Cookies（可选）", type: "password", placeholder: "已有的登录 cookies", required: false, helpText: "如已有 cookies 可直接填入，避免重复登录" },
  ],
  ftp: [
    { key: "protocol", label: "Protocol", type: "text", placeholder: "sftp", required: true, helpText: "Choose 'ftp' or 'sftp'" },
    { key: "host", label: "Host", type: "text", placeholder: "ftp.example.com", required: true },
    { key: "port", label: "Port", type: "number", placeholder: "21 (FTP) / 22 (SFTP)", required: false, helpText: "Default: 21 for FTP, 22 for SFTP" },
    { key: "username", label: "Username", type: "text", placeholder: "user", required: true },
    { key: "password", label: "Password", type: "password", placeholder: "••••••••", required: false, helpText: "Password for authentication" },
    { key: "privateKey", label: "SSH Private Key Path (SFTP)", type: "text", placeholder: "/home/user/.ssh/id_rsa", required: false, helpText: "Path to SSH private key (SFTP alternative to password)" },
    { key: "passphrase", label: "Private Key Passphrase", type: "password", placeholder: "••••••••", required: false, helpText: "Passphrase for the SSH private key" },
    { key: "secure", label: "Use FTPS", type: "text", placeholder: "false", required: false, helpText: "Set to 'true' for FTP over TLS" },
    { key: "pathPrefix", label: "Path Prefix", type: "text", placeholder: "/uploads", required: false, helpText: "Optional subdirectory within the FTP root" },
  ],
  mount: [
    { key: "mountProtocol", label: "Mount Protocol", type: "text", placeholder: "webdav", required: true, helpText: "Protocol: webdav, nfs, or smb (select below)", defaultValue: "webdav" },
    { key: "serverUrl", label: "Server URL / Host", type: "url", placeholder: "https://nextcloud.example.com/dav/ or 192.168.1.100", required: true, helpText: "WebDAV: full endpoint URL. NFS/SMB: server hostname or IP" },
    { key: "username", label: "Username", type: "text", placeholder: "user", required: false, helpText: "Username for WebDAV or SMB authentication" },
    { key: "password", label: "Password", type: "password", placeholder: "••••••••", required: false, helpText: "Password for WebDAV or SMB authentication" },
    { key: "mountPath", label: "Local Mount Point", type: "text", placeholder: "/mnt/nfs-share", required: false, helpText: "Local mount path for NFS/SMB. For WebDAV, used as path prefix." },
    { key: "domain", label: "Domain (SMB)", type: "text", placeholder: "WORKGROUP", required: false, helpText: "Windows domain for SMB/CIFS (optional)" },
    { key: "nfsExportPath", label: "NFS Export Path", type: "text", placeholder: "/export/data", required: false, helpText: "NFS export path on the server (NFS only)" },
    { key: "pathPrefix", label: "Path Prefix", type: "text", placeholder: "clouddrive", required: false, helpText: "Optional subdirectory within mounted storage" },
  ],
};

// Auth status badge component
function AuthStatusBadge({ status, t }: { status: string; t: Record<string, string> }) {
  const config: Record<string, { color: string; icon: typeof CheckCircle2; label: string }> = {
    pending: { color: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30", icon: Clock, label: t.pending || "Pending" },
    authorized: { color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30", icon: ShieldCheck, label: t.authorized || "Authorized" },
    expired: { color: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30", icon: ShieldAlert, label: t.expired || "Expired" },
    error: { color: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30", icon: ShieldX, label: t.authError || "Error" },
  };

  const c = config[status] || config.error;
  const Icon = c.icon;

  return (
    <Badge variant="outline" className={cn("text-[10px] gap-1", c.color)}>
      <Icon className="w-3 h-3" />
      {c.label}
    </Badge>
  );
}

// Auth type badge component
function AuthTypeBadge({ authType, t }: { authType: string; t: Record<string, string> }) {
  const config: Record<string, { color: string; icon: typeof Key; label: string }> = {
    oauth: { color: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30", icon: Key, label: t.oauth || "OAuth" },
    password: { color: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/30", icon: ShieldCheck, label: t.password || "Password" },
    sms: { color: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30", icon: Smartphone, label: t.sms || "SMS" },
    none: { color: "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30", icon: Globe, label: t.none || "None" },
  };

  const c = config[authType] || config.none;
  const Icon = c.icon;

  return (
    <Badge variant="outline" className={cn("text-[10px] gap-1", c.color)}>
      <Icon className="w-3 h-3" />
      {c.label}
    </Badge>
  );
}

export function AdminDriversTab() {
  const queryClient = useQueryClient();
  const { t } = useI18n();

  const driverTypeLabels: Record<string, string> = {
    local: t.admin.localStorage,
    webdav: t.admin.webdav,
    s3: t.admin.s3,
    mount: t.admin.networkMount || "Network Mount",
    baidu: t.admin.baiduWangpan,
    aliyun: t.admin.aliyunDrive,
    onedrive: t.admin.oneDrive,
    google: t.admin.googleDrive,
    "115": t.admin.drive115,
    quark: t.admin.quarkDrive,
    ftp: "FTP / SFTP",
  };

  const [addDriverOpen, setAddDriverOpen] = useState(false);
  const [newDriverType, setNewDriverType] = useState("local");
  const [newDriverName, setNewDriverName] = useState("");
  const [newDriverBasePath, setNewDriverBasePath] = useState("./storage");
  const [newDriverMountPath, setNewDriverMountPath] = useState("/local");
  const [newDriverIsReadOnly, setNewDriverIsReadOnly] = useState(false);
  const [newDriverPriority, setNewDriverPriority] = useState(0);
  const [newDriverIsDefault, setNewDriverIsDefault] = useState(false);
  const [newDriverConfig, setNewDriverConfig] = useState<Record<string, string>>({});
  const [testingDriverId, setTestingDriverId] = useState<string | null>(null);
  const [authorizingDriverId, setAuthorizingDriverId] = useState<string | null>(null);
  const [gettingStartedDismissed, setGettingStartedDismissed] = useState(false);

  // Check localStorage for dismissed state
  useEffect(() => {
    try {
      const dismissed = localStorage.getItem("clouddrive-getting-started-dismissed");
      if (dismissed === "true") setGettingStartedDismissed(true);
    } catch { /* ignore */ }
  }, []);

  const defaultMountPaths: Record<string, string> = {
    local: "/local",
    s3: "/s3",
    webdav: "/webdav",
    mount: "/network",
    ftp: "/ftp",
    baidu: "/baidu",
    aliyun: "/aliyun",
    onedrive: "/onedrive",
    google: "/google",
    "115": "/115",
    quark: "/quark",
  };

  // Reset form when type changes
  const handleTypeChange = (type: string) => {
    setNewDriverType(type);
    setNewDriverConfig(type === "mount" ? { mountProtocol: "webdav" } : {});
    setNewDriverBasePath(type === "local" ? "./storage" : "");
    setNewDriverMountPath(defaultMountPaths[type] || `/${type}`);
    setNewDriverIsReadOnly(false);
  };

  const { data, isLoading } = useQuery({
    queryKey: ["admin-drivers"],
    queryFn: async () => {
      const res = await fetch("/api/admin/drivers");
      if (!res.ok) throw new Error("Failed to fetch drivers");
      return res.json();
    },
  });

  const drivers: DriverInfo[] = data?.drivers || [];
  const defaultDriver = data?.defaultDriver;

  const createDriver = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        name: newDriverName,
        type: newDriverType,
        basePath: newDriverBasePath,
        mountPath: newDriverMountPath,
        isReadOnly: newDriverIsReadOnly,
        priority: newDriverPriority,
        isDefault: newDriverIsDefault,
        config: newDriverConfig,
      };
      const res = await fetch("/api/admin/drivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create driver");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-drivers"] });
      setAddDriverOpen(false);
      setNewDriverName("");
      setNewDriverType("local");
      setNewDriverBasePath("./storage");
      setNewDriverMountPath("/local");
      setNewDriverIsReadOnly(false);
      setNewDriverPriority(0);
      setNewDriverIsDefault(false);
      setNewDriverConfig({});
      toast.success("Storage driver created successfully");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateDriver = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Record<string, unknown>) => {
      const res = await fetch(`/api/admin/drivers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update driver");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-drivers"] });
      toast.success("Driver updated successfully");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteDriver = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/drivers/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete driver");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-drivers"] });
      toast.success("Driver deleted successfully");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const handleHealthCheck = async (driver: DriverInfo) => {
    setTestingDriverId(driver.id);
    try {
      const res = await fetch(`/api/admin/drivers/${driver.id}/health-check`);
      if (res.ok) {
        const data = await res.json();
        if (data.healthy) {
          toast.success(`"${driver.name}" is healthy and accessible`);
        } else {
          toast.error(`"${driver.name}": ${data.message || "Health check failed"}`);
        }
      } else {
        toast.error("Health check request failed");
      }
    } catch {
      toast.error("Health check request failed");
    } finally {
      setTestingDriverId(null);
    }
  };

  const handleTestConnection = async () => {
    toast.info("Test connection will be available after driver creation");
  };

  const handleOAuthAuthorize = async (driver: DriverInfo) => {
    setAuthorizingDriverId(driver.id);
    try {
      const res = await fetch("/api/auth/cloud-oauth/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId: driver.id }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to initiate OAuth");
      }

      const result = await res.json();
      if (result.authorizationUrl) {
        window.open(result.authorizationUrl, "_blank", "width=600,height=700");
        toast.info(t.admin.oauthAuthorize + " — " + t.admin.authPending);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.admin.authFailed);
    } finally {
      setAuthorizingDriverId(null);
    }
  };

  // Combine existing drivers with default driver info
  const allDrivers = drivers.length > 0
    ? drivers
    : defaultDriver
      ? [defaultDriver as DriverInfo]
      : [];

  const currentConfigFields = driverConfigFields[newDriverType] || [];

  // Cloud driver type info for info cards
  const cloudDriverCards = [
    { type: "baidu", icon: Cloud, labelKey: "baiduWangpan" as const, descKey: "baiduWangpanDesc" as const, authType: "oauth" },
    { type: "aliyun", icon: Cloud, labelKey: "aliyunDrive" as const, descKey: "aliyunDriveDesc" as const, authType: "oauth" },
    { type: "onedrive", icon: Cloud, labelKey: "oneDrive" as const, descKey: "oneDriveDesc" as const, authType: "oauth" },
    { type: "google", icon: Cloud, labelKey: "googleDrive" as const, descKey: "googleDriveDesc" as const, authType: "oauth" },
    { type: "115", icon: HardDrive, labelKey: "drive115" as const, descKey: "drive115Desc" as const, authType: "password" },
    { type: "quark", icon: HardDrive, labelKey: "quarkDrive" as const, descKey: "quarkDriveDesc" as const, authType: "sms" },
  ];

  // Format relative time
  const formatRelativeTime = (isoString: string | null | undefined) => {
    if (!isoString) return null;
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return t.app.justNow;
      if (diffMins < 60) return `${diffMins}${t.app.minAgo}`;
      const diffHrs = Math.floor(diffMins / 60);
      if (diffHrs < 24) return `${diffHrs}${t.app.hrAgo}`;
      const diffDays = Math.floor(diffHrs / 24);
      return `${diffDays}${t.app.dayAgo}`;
    } catch {
      return null;
    }
  };

  // Render driver-specific config info
  const renderDriverConfigInfo = (driver: DriverInfo) => {
    if (driver.type === "local") {
      if (driver.basePath) {
        return <div>{t.admin.basePath}: <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{driver.basePath}</code></div>;
      }
      return null;
    }

    try {
      const config = JSON.parse(driver.config || "{}");

      if (driver.type === "s3") {
        return (
          <div className="space-y-0.5">
            {config.endpoint && <div>Endpoint: <code className="text-xs bg-muted px-1 py-0.5 rounded">{config.endpoint}</code></div>}
            <div>Bucket: <code className="text-xs bg-muted px-1 py-0.5 rounded">{config.bucket}</code> · Region: <code className="text-xs bg-muted px-1 py-0.5 rounded">{config.region}</code></div>
          </div>
        );
      }

      if (driver.type === "webdav") {
        return <div>URL: <code className="text-xs bg-muted px-1 py-0.5 rounded">{config.url}</code></div>;
      }

      if (driver.type === "mount") {
        const proto = config.mountProtocol || "webdav";
        const protoLabel = proto === "webdav" ? (t.admin.webdavProtocol || "WebDAV") : proto === "nfs" ? (t.admin.nfsProtocol || "NFS") : (t.admin.smbProtocol || "SMB");
        return (
          <div className="space-y-0.5">
            <div>{t.admin.mountProtocol || "Protocol"}: <Badge variant="outline" className="text-[10px] gap-1 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">{protoLabel}</Badge></div>
            {config.serverUrl && <div>{t.admin.mountUrl || "Server"}: <code className="text-xs bg-muted px-1 py-0.5 rounded">{config.serverUrl}</code></div>}
            {config.mountPath && <div>{t.admin.mountPath || "Mount Path"}: <code className="text-xs bg-muted px-1 py-0.5 rounded">{config.mountPath}</code></div>}
            {config.nfsExportPath && proto === "nfs" && <div>NFS Export: <code className="text-xs bg-muted px-1 py-0.5 rounded">{config.nfsExportPath}</code></div>}
            {config.domain && proto === "smb" && <div>Domain: <code className="text-xs bg-muted px-1 py-0.5 rounded">{config.domain}</code></div>}
            {config.pathPrefix && <div>Prefix: <code className="text-xs bg-muted px-1 py-0.5 rounded">{config.pathPrefix}</code></div>}
          </div>
        );
      }

      // Cloud drive drivers
      if (isCloudDriver(driver.type)) {
        return (
          <div className="space-y-0.5">
            {/* Auth type and status */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">{t.admin.authType}:</span>
              <AuthTypeBadge authType={driver.authType || "none"} t={t.admin} />
              <span className="text-xs text-muted-foreground">{t.admin.authStatus}:</span>
              <AuthStatusBadge status={driver.authStatus || "pending"} t={t.admin} />
            </div>
            {/* OAuth driver info */}
            {isOAuthDriver(driver.type) && (
              <>
                {config.clientId && (
                  <div>{t.admin.clientId}: <code className="text-xs bg-muted px-1 py-0.5 rounded">{config.clientId.substring(0, 8)}...</code></div>
                )}
                {driver.accessToken && (
                  <div>Access Token: <code className="text-xs bg-muted px-1 py-0.5 rounded">{driver.accessToken}</code></div>
                )}
                {driver.refreshToken && (
                  <div>Refresh Token: <code className="text-xs bg-muted px-1 py-0.5 rounded">{driver.refreshToken}</code></div>
                )}
                {driver.tokenExpiresAt && (
                  <div>{t.admin.tokenExpiresAt}: {new Date(driver.tokenExpiresAt).toLocaleString()}</div>
                )}
              </>
            )}
            {/* Password driver info */}
            {driver.type === "115" && config.username && (
              <div>{t.admin.username}: <code className="text-xs bg-muted px-1 py-0.5 rounded">{config.username}</code></div>
            )}
            {/* SMS driver info */}
            {driver.type === "quark" && config.phone && (
              <div>{t.admin.username}: <code className="text-xs bg-muted px-1 py-0.5 rounded">{config.phone}</code></div>
            )}
            {/* Last sync */}
            {driver.lastSyncAt && (() => {
              const relTime = formatRelativeTime(driver.lastSyncAt);
              return relTime ? <div>{t.admin.lastSyncAt}: {relTime}</div> : null;
            })()}
          </div>
        );
      }
    } catch { /* ignore parse error */ }
    return null;
  };

  // Should show Getting Started card
  const showGettingStarted = !gettingStartedDismissed && allDrivers.length <= 1 &&
    (allDrivers.length === 0 || allDrivers[0]?.type === "local");

  // Driver type tooltip descriptions
  const driverTypeTooltips: Record<string, string> = {
    local: "Local Disk: Store files on the server's local filesystem",
    s3: "S3: Connect to Amazon S3 or S3-compatible storage (MinIO, etc.)",
    webdav: "WebDAV: Connect to WebDAV servers like Nextcloud or ownCloud",
    mount: "Network Mount: Mount NFS/SMB shared folders or WebDAV drives",
    ftp: "FTP/SFTP: Connect to FTP or SFTP servers for file access",
    baidu: "Baidu Wangpan: Connect via OAuth to access your Baidu cloud files",
    aliyun: "Aliyun Drive: Connect via OAuth to access your Aliyun cloud files",
    onedrive: "OneDrive: Connect via OAuth to Microsoft OneDrive",
    google: "Google Drive: Connect via OAuth to access your Google Drive files",
    "115": "115 Network Disk: Login with account credentials to access 115 cloud files",
    quark: "Quark Drive: Login via phone/SMS to access Quark cloud files",
  };

  return (
    <div className="space-y-4">
      {/* Getting Started Info Card */}
      {showGettingStarted && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
        >
          <Card className="border-emerald-200/50 dark:border-emerald-800/30 bg-gradient-to-br from-emerald-50/50 to-sky-50/50 dark:from-emerald-950/20 dark:to-sky-950/20">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-emerald-500/10">
                    <Info className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Getting Started with Drivers</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      CloudDrive supports multiple storage backends. Add drivers to connect to cloud storage services, network drives, or local directories.
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 shrink-0"
                  onClick={() => {
                    setGettingStartedDismissed(true);
                    try { localStorage.setItem("clouddrive-getting-started-dismissed", "true"); } catch { /* ignore */ }
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { icon: "📁", label: "Local Disk", desc: "Mount local directories" },
                  { icon: "☁️", label: "S3", desc: "Amazon S3 compatible storage" },
                  { icon: "🌐", label: "WebDAV", desc: "Connect to WebDAV servers" },
                  { icon: "🔗", label: "Network Mount", desc: "NFS/SMB shared folders" },
                  { icon: "📂", label: "FTP / SFTP", desc: "Connect to FTP or SFTP servers" },
                  { icon: "🔑", label: "Cloud Drives", desc: "Baidu, Aliyun, OneDrive, Google Drive (OAuth)" },
                  { icon: "🔐", label: "Account Drives", desc: "115, Quark (Password/SMS)" },
                ].map((item) => (
                  <div key={item.label} className="flex items-start gap-2 rounded-lg bg-background/60 p-2 border border-border/50">
                    <span className="text-base shrink-0 mt-0.5">{item.icon}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium leading-tight">{item.label}</p>
                      <p className="text-[10px] text-muted-foreground leading-tight">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">
            {t.admin.manageStorageBackends}
          </h3>
        </div>
        <Dialog open={addDriverOpen} onOpenChange={setAddDriverOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              <Plus className="w-4 h-4" />
              {t.admin.addDriver}
            </Button>
          </DialogTrigger>
          <DialogContent
            className="max-w-lg max-h-[85vh] overflow-y-auto"
            onInteractOutside={(e) => {
              const target = e.target as HTMLElement;
              if (target.closest('[role="menu"]') || target.closest('[data-radix-popper-content-wrapper]')) {
                e.preventDefault();
              }
            }}
            onPointerDownOutside={(e) => {
              const target = e.target as HTMLElement;
              if (target.closest('[role="menu"]') || target.closest('[data-radix-popper-content-wrapper]')) {
                e.preventDefault();
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>{t.admin.addStorageDriver}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {/* Driver Name */}
              <div className="space-y-2">
                <Label htmlFor="driver-name">{t.admin.driverName}</Label>
                <Input
                  id="driver-name"
                  value={newDriverName}
                  onChange={(e) => setNewDriverName(e.target.value)}
                  placeholder={t.admin.primaryStorage}
                />
              </div>

              {/* Mount Path (VFS) */}
              <div className="space-y-2">
                <Label htmlFor="driver-mount-path">Mount Path (VFS)</Label>
                <Input
                  id="driver-mount-path"
                  value={newDriverMountPath}
                  onChange={(e) => setNewDriverMountPath(e.target.value)}
                  placeholder="/local"
                />
                <p className="text-xs text-muted-foreground">
                  This is the virtual path where the driver will be accessible in the unified file browser.
                  E.g., "/baidu" means files will be at /baidu/... in the VFS.
                </p>
              </div>

              {/* Read-only toggle */}
              <div className="flex items-center justify-between gap-3 py-1">
                <div className="space-y-0.5">
                  <Label htmlFor="driver-readonly">Read-only mount</Label>
                  <p className="text-xs text-muted-foreground">Prevent write operations on this storage driver</p>
                </div>
                <Switch
                  id="driver-readonly"
                  checked={newDriverIsReadOnly}
                  onCheckedChange={(checked) => setNewDriverIsReadOnly(checked)}
                />
              </div>

              {/* Driver Type - Categorized Layout */}
              <div className="space-y-3">
                <Label>{t.admin.type}</Label>

                {/* Storage Protocols */}
                <div className="space-y-1.5">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                    Storage Protocols
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={newDriverType === "local" ? "default" : "outline"}
                          size="sm"
                          className={cn(newDriverType === "local" && "bg-emerald-600 hover:bg-emerald-700")}
                          onClick={() => handleTypeChange("local")}
                        >
                          <Server className="w-4 h-4 mr-1.5" />
                          {t.admin.local}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">{driverTypeTooltips.local}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={newDriverType === "s3" ? "default" : "outline"}
                          size="sm"
                          className={cn(newDriverType === "s3" && "bg-emerald-600 hover:bg-emerald-700")}
                          onClick={() => handleTypeChange("s3")}
                        >
                          <Cloud className="w-4 h-4 mr-1.5" />
                          Amazon S3
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">{driverTypeTooltips.s3}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={newDriverType === "webdav" ? "default" : "outline"}
                          size="sm"
                          className={cn(newDriverType === "webdav" && "bg-emerald-600 hover:bg-emerald-700")}
                          onClick={() => handleTypeChange("webdav")}
                        >
                          <Globe className="w-4 h-4 mr-1.5" />
                          {t.admin.webdav}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">{driverTypeTooltips.webdav}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={newDriverType === "mount" ? "default" : "outline"}
                          size="sm"
                          className={cn(newDriverType === "mount" && "bg-emerald-600 hover:bg-emerald-700")}
                          onClick={() => handleTypeChange("mount")}
                        >
                          <Network className="w-4 h-4 mr-1.5" />
                          {t.admin.networkMount || "Network Mount"}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">{driverTypeTooltips.mount}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={newDriverType === "ftp" ? "default" : "outline"}
                          size="sm"
                          className={cn(newDriverType === "ftp" && "bg-emerald-600 hover:bg-emerald-700")}
                          onClick={() => handleTypeChange("ftp")}
                        >
                          <Globe className="w-4 h-4 mr-1.5" />
                          FTP / SFTP
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">{driverTypeTooltips.ftp}</TooltipContent>
                    </Tooltip>
                  </div>
                </div>

                {/* Third-Party Cloud Drives - OAuth */}
                <div className="space-y-1.5">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Key className="w-3 h-3" />
                    {t.admin.thirdPartyCloud} — OAuth
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={newDriverType === "baidu" ? "default" : "outline"}
                          size="sm"
                          className={cn(newDriverType === "baidu" && "bg-emerald-600 hover:bg-emerald-700")}
                          onClick={() => handleTypeChange("baidu")}
                        >
                          <Cloud className="w-4 h-4 mr-1.5" />
                          {t.admin.baiduWangpan}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">{driverTypeTooltips.baidu}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={newDriverType === "aliyun" ? "default" : "outline"}
                          size="sm"
                          className={cn(newDriverType === "aliyun" && "bg-emerald-600 hover:bg-emerald-700")}
                          onClick={() => handleTypeChange("aliyun")}
                        >
                          <Cloud className="w-4 h-4 mr-1.5" />
                          {t.admin.aliyunDrive}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">{driverTypeTooltips.aliyun}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={newDriverType === "onedrive" ? "default" : "outline"}
                          size="sm"
                          className={cn(newDriverType === "onedrive" && "bg-emerald-600 hover:bg-emerald-700")}
                          onClick={() => handleTypeChange("onedrive")}
                        >
                          <Cloud className="w-4 h-4 mr-1.5" />
                          {t.admin.oneDrive}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">{driverTypeTooltips.onedrive}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={newDriverType === "google" ? "default" : "outline"}
                          size="sm"
                          className={cn(newDriverType === "google" && "bg-emerald-600 hover:bg-emerald-700")}
                          onClick={() => handleTypeChange("google")}
                        >
                          <Cloud className="w-4 h-4 mr-1.5" />
                          {t.admin.googleDrive}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">{driverTypeTooltips.google}</TooltipContent>
                    </Tooltip>
                  </div>
                </div>

                {/* Third-Party Cloud Drives - Account */}
                <div className="space-y-1.5">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <ShieldCheck className="w-3 h-3" />
                    {t.admin.thirdPartyCloud} — {t.admin.loginWithPassword}
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={newDriverType === "115" ? "default" : "outline"}
                          size="sm"
                          className={cn(newDriverType === "115" && "bg-emerald-600 hover:bg-emerald-700")}
                          onClick={() => handleTypeChange("115")}
                        >
                          <HardDrive className="w-4 h-4 mr-1.5" />
                          {t.admin.drive115}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">{driverTypeTooltips["115"]}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={newDriverType === "quark" ? "default" : "outline"}
                          size="sm"
                          className={cn(newDriverType === "quark" && "bg-emerald-600 hover:bg-emerald-700")}
                          onClick={() => handleTypeChange("quark")}
                        >
                          <HardDrive className="w-4 h-4 mr-1.5" />
                          {t.admin.quarkDrive}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">{driverTypeTooltips.quark}</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </div>

              {/* Type-specific config fields */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={newDriverType}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.15 }}
                  className="space-y-3"
                >
                  {/* OAuth auth notice */}
                  {isOAuthDriver(newDriverType) && (
                    <div className="flex items-start gap-2 p-2.5 rounded-lg bg-blue-500/5 border border-blue-500/20">
                      <Key className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                      <div className="text-xs text-blue-700 dark:text-blue-400">
                        {t.admin.oauthAuthorize}: {t.admin.authRequired}. {t.admin.startOAuth} {t.admin.authorize.toLowerCase()}.
                      </div>
                    </div>
                  )}
                  {/* Password auth notice */}
                  {isPasswordDriver(newDriverType) && (
                    <div className="flex items-start gap-2 p-2.5 rounded-lg bg-violet-500/5 border border-violet-500/20">
                      <ShieldCheck className="w-4 h-4 text-violet-500 mt-0.5 shrink-0" />
                      <div className="text-xs text-violet-700 dark:text-violet-400">
                        {newDriverType === "quark"
                          ? t.admin.loginWithSms
                          : t.admin.loginWithPassword}
                      </div>
                    </div>
                  )}
                  {/* Mount protocol selector */}
                  {newDriverType === "mount" && (
                    <div className="space-y-3">
                      {/* Protocol notice */}
                      <div className="flex items-start gap-2 p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                        <Network className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                        <div className="text-xs text-emerald-700 dark:text-emerald-400">
                          {t.admin.networkMount || "Network Mount"}: Select the protocol for mounting remote storage.
                          NFS and SMB require the share to be already mounted at a local path on the server.
                        </div>
                      </div>
                      {/* Protocol selector */}
                      <div className="space-y-1.5">
                        <Label className="text-xs">{t.admin.mountProtocol || "Protocol"}</Label>
                        <div className="flex gap-2">
                          {(["webdav", "nfs", "smb"] as const).map((proto) => {
                            const protoIcons: Record<string, typeof Globe> = {
                              webdav: Globe,
                              nfs: Server,
                              smb: HardDrive,
                            };
                            const protoLabels: Record<string, string> = {
                              webdav: t.admin.webdavProtocol || "WebDAV",
                              nfs: t.admin.nfsProtocol || "NFS",
                              smb: t.admin.smbProtocol || "SMB",
                            };
                            const ProtoIcon = protoIcons[proto];
                            const isSelected = (newDriverConfig.mountProtocol || "webdav") === proto;
                            return (
                              <Button
                                key={proto}
                                variant={isSelected ? "default" : "outline"}
                                size="sm"
                                className={cn(isSelected && "bg-emerald-600 hover:bg-emerald-700")}
                                onClick={() => setNewDriverConfig({ ...newDriverConfig, mountProtocol: proto })}
                              >
                                <ProtoIcon className="w-4 h-4 mr-1.5" />
                                {protoLabels[proto]}
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                  {currentConfigFields
                    .filter((field) => {
                      // For mount type, conditionally show fields based on protocol
                      if (newDriverType === "mount") {
                        const proto = newDriverConfig.mountProtocol || "webdav";
                        // mountProtocol is handled by the selector above, skip it
                        if (field.key === "mountProtocol") return false;
                        // NFS-specific fields
                        if (field.key === "nfsExportPath" && proto !== "nfs") return false;
                        // SMB-specific fields
                        if (field.key === "domain" && proto !== "smb") return false;
                        // Username/password needed for webdav and smb, not nfs
                        if ((field.key === "username" || field.key === "password") && proto === "nfs") return false;
                        // mountPath needed for nfs and smb, not webdav (webdav uses pathPrefix)
                        if (field.key === "mountPath" && proto === "webdav") return false;
                      }
                      return true;
                    })
                    .map((field) => (
                    <div key={field.key} className="space-y-1.5">
                      <Label htmlFor={`config-${field.key}`} className="text-xs">
                        {field.label}
                        {field.required && <span className="text-destructive ml-0.5">*</span>}
                      </Label>
                      <Input
                        id={`config-${field.key}`}
                        type={field.type === "password" ? "password" : "text"}
                        value={newDriverConfig[field.key] || (field.key === "mountProtocol" ? newDriverConfig.mountProtocol || field.defaultValue || "" : "")}
                        onChange={(e) =>
                          setNewDriverConfig({ ...newDriverConfig, [field.key]: e.target.value })
                        }
                        placeholder={field.placeholder}
                      />
                      {field.helpText && (
                        <p className="text-[11px] text-muted-foreground">{field.helpText}</p>
                      )}
                    </div>
                  ))}
                </motion.div>
              </AnimatePresence>

              {/* Priority and Default */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="driver-priority">{t.admin.priority}</Label>
                  <Input
                    id="driver-priority"
                    type="number"
                    value={newDriverPriority}
                    onChange={(e) => setNewDriverPriority(parseInt(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-2 flex flex-col">
                  <Label>{t.admin.defaultDriver}</Label>
                  <div className="flex items-center gap-2 mt-2">
                    <Switch
                      checked={newDriverIsDefault}
                      onCheckedChange={(checked) => setNewDriverIsDefault(checked)}
                    />
                    <span className="text-sm text-muted-foreground">
                      {newDriverIsDefault ? t.admin.yes : t.admin.no}
                    </span>
                  </div>
                </div>
              </div>

              {/* Test Connection Button */}
              {(newDriverType === "s3" || newDriverType === "webdav" || newDriverType === "mount") && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={handleTestConnection}
                >
                  <TestTube className="w-4 h-4" />
                  {t.admin.testConnection}
                </Button>
              )}
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">{t.app.cancel}</Button>
              </DialogClose>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => createDriver.mutate()}
                disabled={createDriver.isPending || !newDriverName}
              >
                {createDriver.isPending ? t.app.creating : t.admin.addDriver}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Drivers List */}
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-6 w-48 mb-2" />
                <Skeleton className="h-4 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {allDrivers.map((driver, idx) => {
            const Icon = driverTypeIcons[driver.type] || Server;
            const isActive = driver.status === "active";
            const isCloud = isCloudDriver(driver.type);
            const isOAuth = isOAuthDriver(driver.type);
            const isExpired = driver.authStatus === "expired";

            return (
              <motion.div
                key={driver.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
              >
                <Card className={cn(
                  "transition-all duration-200",
                  isActive ? "border-emerald-500/20" : "border-border opacity-60",
                )}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className={cn(
                        "p-3 rounded-xl",
                        isActive ? "bg-emerald-500/10" : "bg-muted",
                      )}>
                        <Icon className={cn(
                          "w-6 h-6",
                          isActive ? "text-emerald-600" : "text-muted-foreground",
                        )} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-semibold">{driver.name}</span>
                          {driver.isDefault && (
                            <Badge className="bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 border-emerald-600/20 text-[10px]">
                              {t.admin.default}
                            </Badge>
                          )}
                          <Badge variant={isActive ? "default" : "secondary"} className={cn(
                            "text-[10px]",
                            isActive && "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 border-emerald-600/20",
                          )}>
                            {isActive ? t.admin.activeStatus : t.admin.inactive}
                          </Badge>
                          {driver.healthy !== undefined && (
                            <Badge variant="outline" className={cn(
                              "text-[10px] gap-1",
                              driver.healthy ? "text-emerald-600 border-emerald-600/30" : "text-destructive border-destructive/30",
                            )}>
                              {driver.healthy ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                              {driver.healthy ? t.admin.healthyStatus : t.admin.unhealthy}
                            </Badge>
                          )}
                          {/* Cloud driver auth badges */}
                          {isCloud && driver.authType && (
                            <AuthTypeBadge authType={driver.authType} t={t.admin} />
                          )}
                          {isCloud && driver.authStatus && (
                            <AuthStatusBadge status={driver.authStatus} t={t.admin} />
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground space-y-0.5">
                          <div>{t.admin.type}: {driverTypeLabels[driver.type] || driver.type} · {t.admin.priority}: {driver.priority}</div>
                          {(driver as DriverInfo).mountPath && (
                            <div className="flex items-center gap-1.5">
                              <FolderOpen className="w-3 h-3 text-muted-foreground shrink-0" />
                              <span className="text-xs text-muted-foreground">Mount:</span>
                              <code className="text-xs bg-muted px-1 py-0.5 rounded">{(driver as DriverInfo).mountPath}</code>
                              {(driver as DriverInfo).isReadOnly && (
                                <Badge variant="outline" className="text-[9px] gap-0.5 bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 ml-1">
                                  Read-only
                                </Badge>
                              )}
                            </div>
                          )}
                          {!(driver as DriverInfo).mountPath && (driver as DriverInfo).isReadOnly && (
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" className="text-[9px] gap-0.5 bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30">
                                Read-only
                              </Badge>
                            </div>
                          )}
                          {renderDriverConfigInfo(driver)}
                          {/* Driver Capacity/Usage Display */}
                          <DriverCapacityDisplay driverId={driver.id} driverName={driver.name} driverType={driver.type} isHealthy={driver.healthy} />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* OAuth Authorize / Re-authorize button */}
                        {isOAuth && (
                          <Button
                            variant="outline"
                            size="sm"
                            className={cn(
                              "gap-1.5",
                              isExpired ? "border-amber-500/50 text-amber-700 hover:text-amber-800 dark:text-amber-400" : "border-blue-500/50 text-blue-700 hover:text-blue-800 dark:text-blue-400",
                            )}
                            onClick={() => handleOAuthAuthorize(driver)}
                            disabled={authorizingDriverId === driver.id}
                          >
                            {authorizingDriverId === driver.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : isExpired ? (
                              <RefreshCw className="w-3.5 h-3.5" />
                            ) : (
                              <ExternalLink className="w-3.5 h-3.5" />
                            )}
                            {isExpired ? t.admin.reauthorize : t.admin.authorize}
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => handleHealthCheck(driver)}
                          disabled={testingDriverId === driver.id}
                        >
                          {testingDriverId === driver.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <TestTube className="w-3.5 h-3.5" />
                          )}
                          {t.admin.test}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => {
                            const newStatus = isActive ? "inactive" : "active";
                            updateDriver.mutate({ id: driver.id, status: newStatus });
                          }}
                        >
                          {isActive ? t.admin.disable : t.admin.enable}
                        </Button>
                        {!driver.isDefault && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            onClick={() => updateDriver.mutate({ id: driver.id, isDefault: true })}
                          >
                            <Settings2 className="w-3.5 h-3.5" />
                            {t.admin.setDefault}
                          </Button>
                        )}
                        {!driver.isDefault && driver.id !== "default-local" && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t.admin.deleteDriver}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t.admin.deleteDriverConfirm} <strong>{driver.name}</strong> {t.admin.deleteDriverWarning}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t.app.cancel}</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive hover:bg-destructive/90"
                                  onClick={() => deleteDriver.mutate(driver.id)}
                                >
                                  {t.app.delete}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}

          {/* Engaging empty state when only default local driver */}
          {allDrivers.length <= 1 && (allDrivers.length === 0 || allDrivers[0]?.type === "local") && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border-2 border-dashed border-emerald-300/50 dark:border-emerald-700/50 bg-gradient-to-br from-emerald-50/30 to-sky-50/30 dark:from-emerald-950/10 dark:to-sky-950/10 p-8 text-center"
            >
              <div className="p-4 rounded-full bg-emerald-500/10 w-fit mx-auto mb-4">
                <FolderOpen className="w-10 h-10 text-emerald-600" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Add Your First Storage Driver
              </h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
                You&apos;re using the local disk driver. Expand your storage by connecting cloud services, network drives, or additional local directories.
              </p>
              <Button
                size="sm"
                className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                onClick={() => setAddDriverOpen(true)}
              >
                <Plus className="w-4 h-4" />
                Add Driver
              </Button>
            </motion.div>
          )}

          {/* Driver Type Info Cards - Storage Protocols */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
            <Card className={cn(
              "transition-all duration-200",
              allDrivers.some(d => d.type === "local") ? "border-emerald-500/20" : "border-dashed opacity-70"
            )}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2.5 rounded-xl bg-emerald-500/10">
                    <Server className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <div className="font-semibold">{t.admin.local}</div>
                    <Badge variant="secondary" className="text-[10px] bg-emerald-600/10 text-emerald-700 dark:text-emerald-400">Active</Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t.admin.localStorage} — Store files on the local filesystem
                </p>
              </CardContent>
            </Card>
            <Card className={cn(
              "transition-all duration-200",
              allDrivers.some(d => d.type === "s3")
                ? "border-emerald-500/20"
                : "border-dashed opacity-70"
            )}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className={cn(
                    "p-2.5 rounded-xl",
                    allDrivers.some(d => d.type === "s3") ? "bg-emerald-500/10" : "bg-muted"
                  )}>
                    <Cloud className={cn(
                      "w-5 h-5",
                      allDrivers.some(d => d.type === "s3") ? "text-emerald-600" : "text-muted-foreground"
                    )} />
                  </div>
                  <div>
                    <div className="font-semibold">{t.admin.s3}</div>
                    <Badge variant={allDrivers.some(d => d.type === "s3") ? "default" : "secondary"} className={cn(
                      "text-[10px]",
                      allDrivers.some(d => d.type === "s3") && "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
                    )}>
                      {allDrivers.some(d => d.type === "s3") ? "Active" : "Available"}
                    </Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t.admin.s3Desc}
                </p>
              </CardContent>
            </Card>
            <Card className={cn(
              "transition-all duration-200",
              allDrivers.some(d => d.type === "webdav")
                ? "border-emerald-500/20"
                : "border-dashed opacity-70"
            )}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className={cn(
                    "p-2.5 rounded-xl",
                    allDrivers.some(d => d.type === "webdav") ? "bg-emerald-500/10" : "bg-muted"
                  )}>
                    <Globe className={cn(
                      "w-5 h-5",
                      allDrivers.some(d => d.type === "webdav") ? "text-emerald-600" : "text-muted-foreground"
                    )} />
                  </div>
                  <div>
                    <div className="font-semibold">{t.admin.webdav}</div>
                    <Badge variant={allDrivers.some(d => d.type === "webdav") ? "default" : "secondary"} className={cn(
                      "text-[10px]",
                      allDrivers.some(d => d.type === "webdav") && "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
                    )}>
                      {allDrivers.some(d => d.type === "webdav") ? "Active" : "Available"}
                    </Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t.admin.webdavDesc}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Driver Type Info Cards - Third-Party Cloud Drives */}
          <div className="mt-2 mb-2">
            <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Cloud className="w-3.5 h-3.5" />
              {t.admin.thirdPartyCloud}
            </h4>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cloudDriverCards.map((card) => {
              const CardIcon = card.icon;
              const hasDriver = allDrivers.some(d => d.type === card.type);
              return (
                <Card key={card.type} className={cn(
                  "transition-all duration-200",
                  hasDriver ? "border-emerald-500/20" : "border-dashed opacity-70"
                )}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className={cn(
                        "p-2.5 rounded-xl",
                        hasDriver ? "bg-emerald-500/10" : "bg-muted"
                      )}>
                        <CardIcon className={cn(
                          "w-5 h-5",
                          hasDriver ? "text-emerald-600" : "text-muted-foreground"
                        )} />
                      </div>
                      <div>
                        <div className="font-semibold">{t.admin[card.labelKey]}</div>
                        <div className="flex items-center gap-1.5">
                          <Badge variant={hasDriver ? "default" : "secondary"} className={cn(
                            "text-[10px]",
                            hasDriver && "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
                          )}>
                            {hasDriver ? "Active" : "Available"}
                          </Badge>
                          <Badge variant="outline" className={cn(
                            "text-[10px]",
                            card.authType === "oauth"
                              ? "text-blue-600 border-blue-500/30"
                              : card.authType === "sms"
                                ? "text-orange-600 border-orange-500/30"
                                : "text-violet-600 border-violet-500/30"
                          )}>
                            {card.authType === "oauth" ? "OAuth" : card.authType === "sms" ? "SMS" : "Password"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t.admin[card.descKey]}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Driver Capacity Display Component ---
function DriverCapacityDisplay({ driverId, driverName, driverType, isHealthy }: { driverId: string; driverName: string; driverType: string; isHealthy?: boolean }) {
  const { t } = useI18n();
  const { data: statsData } = useQuery<{
    usedBytes: number;
    totalBytes: number;
  }>({
    queryKey: ["driver-capacity", driverId],
    queryFn: async () => {
      try {
        const res = await fetch("/api/files/stats");
        if (!res.ok) return { usedBytes: 0, totalBytes: 10737418240 };
        const data = await res.json();
        return {
          usedBytes: data.usedBytes ?? 0,
          totalBytes: data.totalBytes ?? 10737418240,
        };
      } catch {
        return { usedBytes: 0, totalBytes: 10737418240 };
      }
    },
  });

  const usedBytes = statsData?.usedBytes ?? 0;
  const totalBytes = statsData?.totalBytes ?? 10737418240;
  const usagePercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;

  // Health status with color coding
  const healthConfig = isHealthy === true
    ? { color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10", icon: CheckCircle2, label: t.admin.healthyStatus || "Healthy" }
    : isHealthy === false
      ? { color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10", icon: XCircle, label: t.admin.unhealthy || "Unhealthy" }
      : { color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10", icon: Clock, label: t.admin.healthCheckUnavailable || "Unknown" };

  const HealthIcon = healthConfig.icon;

  return (
    <div className="mt-2 p-2.5 rounded-lg border dark:border-white/10 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className={cn("p-1 rounded-md", healthConfig.bg)}>
            <HealthIcon className={cn("w-3 h-3", healthConfig.color)} />
          </div>
          <span className={cn("text-[11px] font-medium", healthConfig.color)}>{healthConfig.label}</span>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {driverType.toUpperCase()} · {driverName}
        </span>
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">{t.admin.capacity || "Capacity"}</span>
          <span className="font-medium">{formatFileSize(usedBytes)} / {formatFileSize(totalBytes)}</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted/50 dark:bg-white/5 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              usagePercent > 80 ? "bg-red-500" : usagePercent > 60 ? "bg-amber-500" : "bg-emerald-500"
            )}
            style={{ width: `${Math.min(usagePercent, 100)}%` }}
          />
        </div>
        <div className="text-right text-[10px] text-muted-foreground">
          {usagePercent.toFixed(1)}% {t.admin.used || "used"}
        </div>
      </div>
    </div>
  );
}
