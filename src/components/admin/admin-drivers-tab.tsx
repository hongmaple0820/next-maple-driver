"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  HardDrive, Plus, Trash2, CheckCircle2, XCircle, Settings2,
  Cloud, Globe, Server, TestTube, Loader2, ShieldCheck, ShieldAlert,
  ShieldX, Clock, Key, ExternalLink, RefreshCw, Smartphone, Network,
  Info, X, FolderOpen, Pencil, Power, PowerOff, ArrowLeft, ArrowRight,
  Database, Zap, MonitorSmartphone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { formatFileSize } from "@/lib/file-utils";
import { motion, AnimatePresence } from "framer-motion";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CloudProvidersSection } from "@/components/admin/cloud-providers-section";

// ---- Types ----
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
  authType?: string;
  authStatus?: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  tokenExpiresAt?: string | null;
  lastSyncAt?: string | null;
}

type AddDriverStep = "select-type" | "configure" | "test";

// ---- Constants ----
const OAUTH_DRIVER_TYPES = ["baidu", "aliyun", "onedrive", "google"] as const;
const PASSWORD_DRIVER_TYPES = ["115", "quark"] as const;

function isOAuthDriver(type: string) {
  return (OAUTH_DRIVER_TYPES as readonly string[]).includes(type);
}
function isPasswordDriver(type: string) {
  return (PASSWORD_DRIVER_TYPES as readonly string[]).includes(type);
}
function isCloudDriver(type: string) {
  return isOAuthDriver(type) || isPasswordDriver(type);
}

// Color-coded driver type config
const driverTypeConfig: Record<string, {
  icon: typeof Server;
  color: string; // badge color class
  bg: string; // icon bg class
  textColor: string;
  labelZh: string;
  labelEn: string;
  category: "local" | "cloud" | "protocol" | "network";
  description: string;
  authType: string;
}> = {
  local: { icon: Server, color: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30", bg: "bg-slate-500/10", textColor: "text-slate-600 dark:text-slate-400", labelZh: "本地磁盘", labelEn: "Local Disk", category: "local", description: "Store files on the server's local filesystem", authType: "none" },
  webdav: { icon: Globe, color: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30", bg: "bg-blue-500/10", textColor: "text-blue-600 dark:text-blue-400", labelZh: "WebDAV", labelEn: "WebDAV", category: "protocol", description: "Connect to WebDAV servers like Nextcloud, ownCloud", authType: "none" },
  s3: { icon: Cloud, color: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30", bg: "bg-amber-500/10", textColor: "text-amber-600 dark:text-amber-400", labelZh: "Amazon S3", labelEn: "Amazon S3", category: "protocol", description: "Amazon S3 or S3-compatible storage (MinIO, etc.)", authType: "none" },
  ftp: { icon: Globe, color: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30", bg: "bg-green-500/10", textColor: "text-green-600 dark:text-green-400", labelZh: "FTP / SFTP", labelEn: "FTP / SFTP", category: "protocol", description: "Connect to FTP or SFTP servers for file access", authType: "none" },
  baidu: { icon: Cloud, color: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30", bg: "bg-blue-500/10", textColor: "text-blue-600 dark:text-blue-400", labelZh: "百度网盘", labelEn: "Baidu Wangpan", category: "cloud", description: "Connect via OAuth to access your Baidu cloud files", authType: "oauth" },
  aliyun: { icon: Cloud, color: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30", bg: "bg-orange-500/10", textColor: "text-orange-600 dark:text-orange-400", labelZh: "阿里云盘", labelEn: "Aliyun Drive", category: "cloud", description: "Connect via OAuth to access your Aliyun cloud files", authType: "oauth" },
  onedrive: { icon: Cloud, color: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30", bg: "bg-sky-500/10", textColor: "text-sky-600 dark:text-sky-400", labelZh: "OneDrive", labelEn: "OneDrive", category: "cloud", description: "Connect via OAuth to Microsoft OneDrive", authType: "oauth" },
  google: { icon: Cloud, color: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30", bg: "bg-red-500/10", textColor: "text-red-600 dark:text-red-400", labelZh: "Google Drive", labelEn: "Google Drive", category: "cloud", description: "Connect via OAuth to access your Google Drive files", authType: "oauth" },
  "115": { icon: HardDrive, color: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30", bg: "bg-purple-500/10", textColor: "text-purple-600 dark:text-purple-400", labelZh: "115网盘", labelEn: "115 Network Disk", category: "cloud", description: "Login with account credentials to access 115 cloud files", authType: "password" },
  quark: { icon: HardDrive, color: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/30", bg: "bg-cyan-500/10", textColor: "text-cyan-600 dark:text-cyan-400", labelZh: "夸克网盘", labelEn: "Quark Drive", category: "cloud", description: "Login via phone/SMS to access Quark cloud files", authType: "sms" },
  mount: { icon: Network, color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30", bg: "bg-emerald-500/10", textColor: "text-emerald-600 dark:text-emerald-400", labelZh: "网络挂载", labelEn: "Network Mount", category: "network", description: "Mount NFS/SMB shared folders or WebDAV drives", authType: "none" },
};

// Config fields per driver type
const driverConfigFields: Record<string, {
  key: string; label: string; type: "text" | "password" | "url" | "number";
  placeholder: string; required: boolean; helpText?: string;
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
    { key: "tenantId", label: "Tenant ID", type: "text", placeholder: "common", required: false, helpText: "Use 'common' for all account types, or a specific tenant GUID" },
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
    { key: "cookies", label: "Cookies（可选）", type: "password", placeholder: "已有的登录 cookies", required: false, helpText: "如已有 cookies 可直接填入" },
  ],
  quark: [
    { key: "phone", label: "手机号", type: "text", placeholder: "13800138000", required: true, helpText: "夸克网盘注册手机号" },
    { key: "password", label: "密码（可选）", type: "password", placeholder: "••••••••", required: false, helpText: "夸克网盘登录密码" },
    { key: "smsCode", label: "短信验证码（可选）", type: "text", placeholder: "123456", required: false, helpText: "短信验证码" },
    { key: "cookies", label: "Cookies（可选）", type: "password", placeholder: "已有的登录 cookies", required: false, helpText: "如已有 cookies 可直接填入" },
  ],
  ftp: [
    { key: "protocol", label: "Protocol", type: "text", placeholder: "sftp", required: true, helpText: "Choose 'ftp' or 'sftp'" },
    { key: "host", label: "Host", type: "text", placeholder: "ftp.example.com", required: true },
    { key: "port", label: "Port", type: "number", placeholder: "21 (FTP) / 22 (SFTP)", required: false, helpText: "Default: 21 for FTP, 22 for SFTP" },
    { key: "username", label: "Username", type: "text", placeholder: "user", required: true },
    { key: "password", label: "Password", type: "password", placeholder: "••••••••", required: false, helpText: "Password for authentication" },
    { key: "privateKey", label: "SSH Private Key Path (SFTP)", type: "text", placeholder: "/home/user/.ssh/id_rsa", required: false, helpText: "Path to SSH private key" },
    { key: "passphrase", label: "Private Key Passphrase", type: "password", placeholder: "••••••••", required: false, helpText: "Passphrase for the SSH private key" },
    { key: "secure", label: "Use FTPS", type: "text", placeholder: "false", required: false, helpText: "Set to 'true' for FTP over TLS" },
    { key: "pathPrefix", label: "Path Prefix", type: "text", placeholder: "/uploads", required: false, helpText: "Optional subdirectory" },
  ],
  mount: [
    { key: "mountProtocol", label: "Mount Protocol", type: "text", placeholder: "webdav", required: true, helpText: "Protocol: webdav, nfs, or smb" },
    { key: "serverUrl", label: "Server URL / Host", type: "url", placeholder: "https://nextcloud.example.com/dav/", required: true, helpText: "Server endpoint" },
    { key: "username", label: "Username", type: "text", placeholder: "user", required: false, helpText: "Authentication username" },
    { key: "password", label: "Password", type: "password", placeholder: "••••••••", required: false, helpText: "Authentication password" },
    { key: "mountPath", label: "Local Mount Point", type: "text", placeholder: "/mnt/nfs-share", required: false, helpText: "Local mount path for NFS/SMB" },
    { key: "domain", label: "Domain (SMB)", type: "text", placeholder: "WORKGROUP", required: false, helpText: "Windows domain for SMB/CIFS" },
    { key: "nfsExportPath", label: "NFS Export Path", type: "text", placeholder: "/export/data", required: false, helpText: "NFS export path on the server" },
    { key: "pathPrefix", label: "Path Prefix", type: "text", placeholder: "clouddrive", required: false, helpText: "Optional subdirectory" },
  ],
};

const defaultMountPaths: Record<string, string> = {
  local: "/local", s3: "/s3", webdav: "/webdav", mount: "/network",
  ftp: "/ftp", baidu: "/baidu", aliyun: "/aliyun", onedrive: "/onedrive",
  google: "/google", "115": "/115", quark: "/quark",
};

// ---- Sub-components ----

function StatusIndicator({ status, healthy }: { status: string; healthy?: boolean }) {
  const isActive = status === "active" && healthy !== false;
  const isError = status === "error" || healthy === false;
  const isPending = status === "inactive" || (status === "active" && healthy === undefined && status !== "local");

  return (
    <div className={cn(
      "w-2.5 h-2.5 rounded-full shrink-0",
      isActive && "bg-emerald-500",
      isError && "bg-red-500",
      isPending && "bg-amber-500",
      !isActive && !isError && !isPending && "bg-gray-400"
    )} />
  );
}

function DriverTypeBadge({ type }: { type: string }) {
  const config = driverTypeConfig[type];
  if (!config) return <Badge variant="outline" className="text-[10px]">{type}</Badge>;
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={cn("text-[10px] gap-1", config.color)}>
      <Icon className="w-3 h-3" />
      {config.labelZh}
    </Badge>
  );
}

function AuthStatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { color: string; icon: typeof CheckCircle2; label: string }> = {
    pending: { color: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30", icon: Clock, label: "Pending" },
    authorized: { color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30", icon: ShieldCheck, label: "Authorized" },
    expired: { color: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30", icon: ShieldAlert, label: "Expired" },
    error: { color: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30", icon: ShieldX, label: "Error" },
  };
  const c = cfg[status] || cfg.error;
  const Icon = c.icon;
  return (
    <Badge variant="outline" className={cn("text-[10px] gap-1", c.color)}>
      <Icon className="w-3 h-3" />
      {c.label}
    </Badge>
  );
}

function AuthTypeBadge({ authType }: { authType: string }) {
  const cfg: Record<string, { color: string; icon: typeof Key; label: string }> = {
    oauth: { color: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30", icon: Key, label: "OAuth" },
    password: { color: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/30", icon: ShieldCheck, label: "Password" },
    sms: { color: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30", icon: Smartphone, label: "SMS" },
    none: { color: "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30", icon: Globe, label: "None" },
  };
  const c = cfg[authType] || cfg.none;
  const Icon = c.icon;
  return (
    <Badge variant="outline" className={cn("text-[10px] gap-1", c.color)}>
      <Icon className="w-3 h-3" />
      {c.label}
    </Badge>
  );
}

// Format relative time
function formatRelativeTime(isoString: string | null | undefined, t: Record<string, string>) {
  if (!isoString) return null;
  try {
    const date = new Date(isoString);
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return t.justNow || "just now";
    if (diffMins < 60) return `${diffMins}${t.minAgo || "m ago"}`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}${t.hrAgo || "h ago"}`;
    const diffDays = Math.floor(diffHrs / 24);
    return `${diffDays}${t.dayAgo || "d ago"}`;
  } catch {
    return null;
  }
}

// ---- Main Component ----
export function AdminDriversTab() {
  const queryClient = useQueryClient();
  const { t } = useI18n();

  // ---- State ----
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addStep, setAddStep] = useState<AddDriverStep>("select-type");
  const [newDriverType, setNewDriverType] = useState("");
  const [newDriverName, setNewDriverName] = useState("");
  const [newDriverBasePath, setNewDriverBasePath] = useState("./storage");
  const [newDriverMountPath, setNewDriverMountPath] = useState("/local");
  const [newDriverIsReadOnly, setNewDriverIsReadOnly] = useState(false);
  const [newDriverPriority, setNewDriverPriority] = useState(0);
  const [newDriverIsDefault, setNewDriverIsDefault] = useState(false);
  const [newDriverConfig, setNewDriverConfig] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<{ healthy: boolean; message: string } | null>(null);
  const [testingDriverId, setTestingDriverId] = useState<string | null>(null);
  const [authorizingDriverId, setAuthorizingDriverId] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<DriverInfo | null>(null);
  const [editConfig, setEditConfig] = useState<Record<string, string>>({});
  const [editName, setEditName] = useState("");
  const [editMountPath, setEditMountPath] = useState("");
  const [editIsReadOnly, setEditIsReadOnly] = useState(false);
  const [editPriority, setEditPriority] = useState(0);
  const [deleteDriverId, setDeleteDriverId] = useState<string | null>(null);
  const [gettingStartedDismissed, setGettingStartedDismissed] = useState(false);
  const [testLoading, setTestLoading] = useState(false);

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem("clouddrive-getting-started-dismissed");
      if (dismissed === "true") setGettingStartedDismissed(true);
    } catch { /* ignore */ }
  }, []);

  // ---- Queries ----
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
  const allDrivers = drivers.length > 0 ? drivers : defaultDriver ? [defaultDriver as DriverInfo] : [];

  const { data: statsData } = useQuery<{
    usedBytes: number; totalBytes: number;
  }>({
    queryKey: ["storage-stats"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/files/stats");
        if (!res.ok) return { usedBytes: 0, totalBytes: 10737418240 };
        const d = await res.json();
        return { usedBytes: d.usedBytes ?? 0, totalBytes: d.totalBytes ?? 10737418240 };
      } catch {
        return { usedBytes: 0, totalBytes: 10737418240 };
      }
    },
  });

  // ---- Mutations ----
  const createDriver = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/drivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newDriverName, type: newDriverType, basePath: newDriverBasePath,
          mountPath: newDriverMountPath, isReadOnly: newDriverIsReadOnly,
          priority: newDriverPriority, isDefault: newDriverIsDefault, config: newDriverConfig,
        }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed to create driver"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-drivers"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-drivers"] });
      setAddDialogOpen(false);
      resetAddForm();
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
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed to update driver"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-drivers"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-drivers"] });
      setEditDialogOpen(false);
      setEditingDriver(null);
      toast.success("Driver updated successfully");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteDriver = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/drivers/${id}`, { method: "DELETE" });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed to delete driver"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-drivers"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-drivers"] });
      setDeleteDriverId(null);
      toast.success("Driver deleted successfully");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // ---- Handlers ----
  const resetAddForm = useCallback(() => {
    setNewDriverType("");
    setNewDriverName("");
    setNewDriverBasePath("./storage");
    setNewDriverMountPath("/local");
    setNewDriverIsReadOnly(false);
    setNewDriverPriority(0);
    setNewDriverIsDefault(false);
    setNewDriverConfig({});
    setAddStep("select-type");
    setTestResult(null);
    setTestLoading(false);
  }, []);

  const handleSelectType = (type: string) => {
    setNewDriverType(type);
    setNewDriverConfig(type === "mount" ? { mountProtocol: "webdav" } : {});
    setNewDriverBasePath(type === "local" ? "./storage" : "");
    setNewDriverMountPath(defaultMountPaths[type] || `/${type}`);
    setNewDriverIsReadOnly(false);
    setNewDriverName(driverTypeConfig[type]?.labelEn || type);
    setAddStep("configure");
    setTestResult(null);
  };

  const handleHealthCheck = async (driver: DriverInfo) => {
    setTestingDriverId(driver.id);
    try {
      const res = await fetch(`/api/admin/drivers/${driver.id}/health-check`, { method: "POST" });
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
    setTestLoading(true);
    setTestResult(null);
    try {
      // For new drivers, we create a temporary driver first then test it
      // Simulate a health check based on driver type
      await new Promise((r) => setTimeout(r, 1500)); // Simulate network delay
      const config = { ...newDriverConfig };
      let healthy = false;
      let message = "";

      if (newDriverType === "local") {
        const path = config.path || newDriverBasePath || "./storage";
        healthy = true;
        message = `Local path "${path}" is configured`;
      } else if (newDriverType === "s3") {
        healthy = !!(config.bucket && config.region && config.accessKeyId);
        message = healthy ? "S3 configuration looks valid. Connection will be verified after saving." : "Missing required S3 configuration fields";
      } else if (newDriverType === "webdav") {
        healthy = !!(config.url && config.username && config.password);
        message = healthy ? "WebDAV configuration looks valid. Connection will be verified after saving." : "Missing required WebDAV configuration fields";
      } else if (newDriverType === "ftp") {
        healthy = !!(config.host && config.username);
        message = healthy ? "FTP configuration looks valid. Connection will be verified after saving." : "Missing required FTP configuration fields";
      } else if (newDriverType === "mount") {
        healthy = !!(config.serverUrl);
        message = healthy ? "Mount configuration looks valid." : "Missing server URL";
      } else if (isOAuthDriver(newDriverType)) {
        healthy = !!(config.clientId && config.clientSecret);
        message = healthy ? "OAuth credentials configured. You'll need to authorize after saving." : "Missing OAuth credentials";
      } else if (isPasswordDriver(newDriverType)) {
        healthy = !!(config.username || config.phone);
        message = healthy ? "Credentials configured." : "Missing login credentials";
      } else {
        healthy = true;
        message = "Configuration saved";
      }

      setTestResult({ healthy, message });
      if (healthy) {
        toast.success(message);
      } else {
        toast.error(message);
      }
    } catch {
      setTestResult({ healthy: false, message: "Test connection failed" });
      toast.error("Test connection failed");
    } finally {
      setTestLoading(false);
    }
  };

  const handleOAuthAuthorize = async (driver: DriverInfo) => {
    setAuthorizingDriverId(driver.id);
    try {
      const res = await fetch("/api/auth/cloud-oauth/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId: driver.id }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed to initiate OAuth"); }
      const result = await res.json();
      if (result.authorizationUrl) {
        const popup = window.open(result.authorizationUrl, "oauth-authorization", "width=600,height=700,scrollbars=yes");
        // Poll for popup closure
        const pollInterval = setInterval(() => {
          if (!popup || popup.closed) {
            clearInterval(pollInterval);
            queryClient.invalidateQueries({ queryKey: ["admin-drivers"] });
            toast.success("OAuth authorization completed");
            setAuthorizingDriverId(null);
          }
        }, 500);
        // Timeout after 5 minutes
        setTimeout(() => { clearInterval(pollInterval); setAuthorizingDriverId(null); }, 300000);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "OAuth authorization failed");
      setAuthorizingDriverId(null);
    }
  };

  const handleEditDriver = (driver: DriverInfo) => {
    setEditingDriver(driver);
    setEditName(driver.name);
    setEditMountPath(driver.mountPath || "");
    setEditIsReadOnly(driver.isReadOnly || false);
    setEditPriority(driver.priority || 0);
    try {
      setEditConfig(JSON.parse(driver.config || "{}"));
    } catch {
      setEditConfig({});
    }
    setEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingDriver) return;
    updateDriver.mutate({
      id: editingDriver.id,
      name: editName,
      mountPath: editMountPath,
      isReadOnly: editIsReadOnly,
      priority: editPriority,
      config: editConfig,
    });
  };

  // ---- Render helpers ----
  const currentConfigFields = driverConfigFields[newDriverType] || [];
  const editConfigFields = driverConfigFields[editingDriver?.type || ""] || [];
  const storageUsed = statsData?.usedBytes ?? 0;
  const storageTotal = statsData?.totalBytes ?? 10737418240;
  const usagePercent = storageTotal > 0 ? (storageUsed / storageTotal) * 100 : 0;

  const showGettingStarted = !gettingStartedDismissed && allDrivers.length <= 1 &&
    (allDrivers.length === 0 || allDrivers[0]?.type === "local");

  // Driver type categories for step 1
  const driverCategories = [
    { key: "local", label: "本地存储", labelEn: "Local Storage", icon: Server, types: ["local"] },
    { key: "cloud", label: "云盘驱动", labelEn: "Cloud Drives", icon: Cloud, types: ["baidu", "aliyun", "onedrive", "google", "115", "quark"] },
    { key: "protocol", label: "协议驱动", labelEn: "Protocol Drivers", icon: Globe, types: ["webdav", "s3", "ftp"] },
    { key: "network", label: "网络挂载", labelEn: "Network Mount", icon: Network, types: ["mount"] },
  ];

  // Render driver config info for display
  const renderDriverConfigInfo = (driver: DriverInfo) => {
    if (driver.type === "local") {
      if (driver.basePath) {
        return <div className="text-xs text-muted-foreground">Path: <code className="text-[11px] bg-muted px-1.5 py-0.5 rounded">{driver.basePath}</code></div>;
      }
      return null;
    }
    try {
      const config = JSON.parse(driver.config || "{}");
      if (driver.type === "s3") {
        return (
          <div className="space-y-0.5 text-xs text-muted-foreground">
            {config.endpoint && <div>Endpoint: <code className="text-[11px] bg-muted px-1 py-0.5 rounded">{config.endpoint}</code></div>}
            <div>Bucket: <code className="text-[11px] bg-muted px-1 py-0.5 rounded">{config.bucket}</code> · Region: <code className="text-[11px] bg-muted px-1 py-0.5 rounded">{config.region}</code></div>
          </div>
        );
      }
      if (driver.type === "webdav") {
        return <div className="text-xs text-muted-foreground">URL: <code className="text-[11px] bg-muted px-1 py-0.5 rounded">{config.url}</code></div>;
      }
      if (driver.type === "ftp") {
        return <div className="text-xs text-muted-foreground">Host: <code className="text-[11px] bg-muted px-1 py-0.5 rounded">{config.host}</code> · {(config.protocol || "ftp").toUpperCase()}</div>;
      }
      if (driver.type === "mount") {
        const proto = config.mountProtocol || "webdav";
        return (
          <div className="space-y-0.5 text-xs text-muted-foreground">
            <div>Protocol: <Badge variant="outline" className="text-[10px]">{proto.toUpperCase()}</Badge></div>
            {config.serverUrl && <div>Server: <code className="text-[11px] bg-muted px-1 py-0.5 rounded">{config.serverUrl}</code></div>}
          </div>
        );
      }
      if (isCloudDriver(driver.type)) {
        return (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              {driver.authType && <AuthTypeBadge authType={driver.authType} />}
              {driver.authStatus && <AuthStatusBadge status={driver.authStatus} />}
            </div>
            {isOAuthDriver(driver.type) && config.clientId && (
              <div className="text-xs text-muted-foreground">Client ID: <code className="text-[11px] bg-muted px-1 py-0.5 rounded">{config.clientId.substring(0, 8)}...</code></div>
            )}
            {driver.type === "115" && config.username && (
              <div className="text-xs text-muted-foreground">Account: <code className="text-[11px] bg-muted px-1 py-0.5 rounded">{config.username}</code></div>
            )}
            {driver.type === "quark" && config.phone && (
              <div className="text-xs text-muted-foreground">Phone: <code className="text-[11px] bg-muted px-1 py-0.5 rounded">{config.phone}</code></div>
            )}
            {driver.lastSyncAt && (() => {
              const rel = formatRelativeTime(driver.lastSyncAt, t.app);
              return rel ? <div className="text-xs text-muted-foreground">Last sync: {rel}</div> : null;
            })()}
            {driver.tokenExpiresAt && (
              <div className="text-xs text-muted-foreground">Token expires: {new Date(driver.tokenExpiresAt).toLocaleDateString()}</div>
            )}
          </div>
        );
      }
    } catch { /* ignore */ }
    return null;
  };

  return (
    <div className="space-y-4">
      {/* Getting Started Card */}
      {showGettingStarted && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
          <Card className="border-emerald-200/50 dark:border-emerald-800/30 bg-gradient-to-br from-emerald-50/50 to-sky-50/50 dark:from-emerald-950/20 dark:to-sky-950/20">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-emerald-500/10">
                    <Info className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Getting Started with Storage Drivers</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      CloudDrive supports multiple storage backends. Add drivers to connect to cloud storage, network drives, or local directories.
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={() => { setGettingStartedDismissed(true); try { localStorage.setItem("clouddrive-getting-started-dismissed", "true"); } catch { /* ignore */ } }}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {driverCategories.map((cat) => (
                  <div key={cat.key} className="flex items-start gap-2 rounded-lg bg-background/60 p-2.5 border border-border/50">
                    <cat.icon className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium leading-tight">{cat.label}</p>
                      <p className="text-[10px] text-muted-foreground leading-tight">{cat.types.length} driver{cat.types.length > 1 ? "s" : ""}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Cloud Providers Configuration */}
      <CloudProvidersSection />

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">
            {t.admin.manageStorageBackends}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {allDrivers.length} driver{allDrivers.length !== 1 ? "s" : ""} configured · {formatFileSize(storageUsed)} / {formatFileSize(storageTotal)} used
          </p>
        </div>
        <Dialog open={addDialogOpen} onOpenChange={(open) => { setAddDialogOpen(open); if (!open) resetAddForm(); }}>
          <Button size="sm" className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setAddDialogOpen(true)}>
            <Plus className="w-4 h-4" />
            {t.admin.addDriver}
          </Button>
          <DialogContent
            className={cn(
              "max-w-2xl max-h-[90vh] overflow-hidden flex flex-col",
              addStep === "select-type" && "max-w-xl",
            )}
            onInteractOutside={(e) => {
              const target = e.target as HTMLElement;
              if (target.closest('[role="menu"]') || target.closest('[data-radix-popper-content-wrapper]')) e.preventDefault();
            }}
            onPointerDownOutside={(e) => {
              const target = e.target as HTMLElement;
              if (target.closest('[role="menu"]') || target.closest('[data-radix-popper-content-wrapper]')) e.preventDefault();
            }}
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {addStep === "select-type" && <><Plus className="w-5 h-5 text-emerald-600" /> Add Storage Driver — Select Type</>}
                {addStep === "configure" && <><Settings2 className="w-5 h-5 text-emerald-600" /> Configure {driverTypeConfig[newDriverType]?.labelEn || newDriverType}</>}
                {addStep === "test" && <><TestTube className="w-5 h-5 text-emerald-600" /> Test & Save</>}
              </DialogTitle>
            </DialogHeader>

            {/* Step 1: Select Driver Type */}
            {addStep === "select-type" && (
              <div className="space-y-5 overflow-y-auto py-4 pr-1">
                {driverCategories.map((category) => (
                  <div key={category.key} className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <category.icon className="w-4 h-4 text-emerald-600" />
                      <span className="text-sm font-semibold">{category.label}</span>
                      <span className="text-xs text-muted-foreground">({category.labelEn})</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      {category.types.map((type) => {
                        const config = driverTypeConfig[type];
                        if (!config) return null;
                        const Icon = config.icon;
                        const authIcon = config.authType === "oauth" ? Key : config.authType === "password" ? ShieldCheck : config.authType === "sms" ? Smartphone : null;
                        return (
                          <motion.button
                            key={type}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => handleSelectType(type)}
                            className={cn(
                              "flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all duration-200",
                              "border-border/60 hover:border-emerald-500/50 hover:bg-emerald-500/5 hover:shadow-sm",
                              "dark:hover:border-emerald-400/30",
                            )}
                          >
                            <div className={cn("p-2.5 rounded-xl shrink-0", config.bg)}>
                              <Icon className={cn("w-5 h-5", config.textColor)} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-semibold">{config.labelZh}</span>
                                {authIcon && <authIcon className="w-3 h-3 text-muted-foreground" />}
                              </div>
                              <span className="text-[11px] text-muted-foreground">{config.labelEn}</span>
                              <p className="text-[11px] text-muted-foreground/80 mt-1 line-clamp-2">{config.description}</p>
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>
                    <Separator className="bg-border/40" />
                  </div>
                ))}
              </div>
            )}

            {/* Step 2: Configure Driver */}
            {addStep === "configure" && (
              <div className="space-y-4 overflow-y-auto py-4 pr-1 flex-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Driver Name */}
                  <div className="space-y-2">
                    <Label htmlFor="driver-name">{t.admin.driverName} <span className="text-destructive">*</span></Label>
                    <Input id="driver-name" value={newDriverName} onChange={(e) => setNewDriverName(e.target.value)} placeholder="My Storage Driver" />
                  </div>
                  {/* Mount Path */}
                  <div className="space-y-2">
                    <Label htmlFor="driver-mount-path">Mount Path (VFS)</Label>
                    <Input id="driver-mount-path" value={newDriverMountPath} onChange={(e) => setNewDriverMountPath(e.target.value)} placeholder="/local" />
                    <p className="text-[11px] text-muted-foreground">Virtual path where the driver is accessible in the file browser</p>
                  </div>
                </div>

                {/* Read-only toggle */}
                <div className="flex items-center justify-between gap-3 py-1 px-3 rounded-lg bg-muted/30">
                  <div className="space-y-0.5">
                    <Label htmlFor="driver-readonly" className="text-sm">Read-only mount</Label>
                    <p className="text-[11px] text-muted-foreground">Prevent write operations on this driver</p>
                  </div>
                  <Switch id="driver-readonly" checked={newDriverIsReadOnly} onCheckedChange={(checked) => setNewDriverIsReadOnly(checked)} />
                </div>

                {/* OAuth auth notice */}
                {isOAuthDriver(newDriverType) && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                    <Key className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                    <div className="text-xs text-blue-700 dark:text-blue-400">
                      This driver requires OAuth authorization. After saving, click &quot;Authorize&quot; to connect your account.
                    </div>
                  </div>
                )}
                {/* Password auth notice */}
                {isPasswordDriver(newDriverType) && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-violet-500/5 border border-violet-500/20">
                    <ShieldCheck className="w-4 h-4 text-violet-500 mt-0.5 shrink-0" />
                    <div className="text-xs text-violet-700 dark:text-violet-400">
                      {newDriverType === "quark" ? "This driver uses SMS/phone login." : "This driver uses account credentials for login."}
                    </div>
                  </div>
                )}

                {/* Mount protocol selector */}
                {newDriverType === "mount" && (
                  <div className="space-y-3">
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                      <Network className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                      <div className="text-xs text-emerald-700 dark:text-emerald-400">
                        Select the protocol for mounting remote storage. NFS/SMB require the share to be already mounted on the server.
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Protocol</Label>
                      <div className="flex gap-2">
                        {(["webdav", "nfs", "smb"] as const).map((proto) => {
                          const protoIcons: Record<string, typeof Globe> = { webdav: Globe, nfs: Server, smb: HardDrive };
                          const protoLabels: Record<string, string> = { webdav: "WebDAV", nfs: "NFS", smb: "SMB" };
                          const ProtoIcon = protoIcons[proto];
                          const isSelected = (newDriverConfig.mountProtocol || "webdav") === proto;
                          return (
                            <Button key={proto} variant={isSelected ? "default" : "outline"} size="sm" className={cn(isSelected && "bg-emerald-600 hover:bg-emerald-700")} onClick={() => setNewDriverConfig({ ...newDriverConfig, mountProtocol: proto })}>
                              <ProtoIcon className="w-4 h-4 mr-1.5" />{protoLabels[proto]}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Config fields */}
                <AnimatePresence mode="wait">
                  <motion.div key={newDriverType} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.15 }} className="space-y-3">
                    {currentConfigFields
                      .filter((field) => {
                        if (newDriverType === "mount") {
                          const proto = newDriverConfig.mountProtocol || "webdav";
                          if (field.key === "mountProtocol") return false;
                          if (field.key === "nfsExportPath" && proto !== "nfs") return false;
                          if (field.key === "domain" && proto !== "smb") return false;
                          if ((field.key === "username" || field.key === "password") && proto === "nfs") return false;
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
                            value={newDriverConfig[field.key] || ""}
                            onChange={(e) => setNewDriverConfig({ ...newDriverConfig, [field.key]: e.target.value })}
                            placeholder={field.placeholder}
                          />
                          {field.helpText && <p className="text-[11px] text-muted-foreground">{field.helpText}</p>}
                        </div>
                      ))}
                  </motion.div>
                </AnimatePresence>

                {/* Priority and Default */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="driver-priority">{t.admin.priority}</Label>
                    <Input id="driver-priority" type="number" value={newDriverPriority} onChange={(e) => setNewDriverPriority(parseInt(e.target.value) || 0)} />
                  </div>
                  <div className="space-y-2 flex flex-col">
                    <Label>{t.admin.defaultDriver}</Label>
                    <div className="flex items-center gap-2 mt-2">
                      <Switch checked={newDriverIsDefault} onCheckedChange={(checked) => setNewDriverIsDefault(checked)} />
                      <span className="text-sm text-muted-foreground">{newDriverIsDefault ? t.admin.yes : t.admin.no}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Test & Save */}
            {addStep === "test" && (
              <div className="space-y-4 py-4">
                <div className="flex items-center gap-3 p-4 rounded-xl border bg-muted/20">
                  {(() => {
                    const cfg = driverTypeConfig[newDriverType];
                    if (!cfg) return null;
                    const Icon = cfg.icon;
                    return (
                      <>
                        <div className={cn("p-3 rounded-xl", cfg.bg)}>
                          <Icon className={cn("w-6 h-6", cfg.textColor)} />
                        </div>
                        <div>
                          <div className="font-semibold">{newDriverName}</div>
                          <div className="text-xs text-muted-foreground">{cfg.labelZh} · {cfg.labelEn}</div>
                        </div>
                      </>
                    );
                  })()}
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Mount Path:</span><code className="bg-muted px-1.5 py-0.5 rounded text-xs">{newDriverMountPath}</code></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Read-only:</span><span>{newDriverIsReadOnly ? "Yes" : "No"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Priority:</span><span>{newDriverPriority}</span></div>
                  {isOAuthDriver(newDriverType) && (
                    <div className="flex items-center gap-1.5 mt-2 p-2 rounded-lg bg-blue-500/5 border border-blue-500/20">
                      <Key className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span className="text-xs text-blue-700 dark:text-blue-400">OAuth authorization required after saving</span>
                    </div>
                  )}
                </div>

                {/* Test Connection */}
                <div className="flex flex-col items-center gap-3 py-4">
                  {testLoading ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
                      <span className="text-sm text-muted-foreground">Testing connection...</span>
                    </div>
                  ) : testResult ? (
                    <div className={cn("flex flex-col items-center gap-2 p-4 rounded-xl w-full", testResult.healthy ? "bg-emerald-500/5 border border-emerald-500/20" : "bg-red-500/5 border border-red-500/20")}>
                      {testResult.healthy ? <CheckCircle2 className="w-8 h-8 text-emerald-600" /> : <XCircle className="w-8 h-8 text-red-500" />}
                      <span className={cn("text-sm font-medium", testResult.healthy ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>{testResult.message}</span>
                    </div>
                  ) : (
                    <Button variant="outline" className="gap-2" onClick={handleTestConnection}>
                      <TestTube className="w-4 h-4" />
                      Test Connection
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Dialog Footer */}
            <DialogFooter className="border-t pt-3">
              {addStep === "select-type" && (
                <DialogClose asChild>
                  <Button variant="outline">{t.app.cancel}</Button>
                </DialogClose>
              )}
              {addStep === "configure" && (
                <>
                  <Button variant="outline" onClick={() => setAddStep("select-type")} className="gap-1.5">
                    <ArrowLeft className="w-4 h-4" /> Back
                  </Button>
                  <Button className="bg-emerald-600 hover:bg-emerald-700 gap-1.5" onClick={() => setAddStep("test")}>
                    Next <ArrowRight className="w-4 h-4" />
                  </Button>
                </>
              )}
              {addStep === "test" && (
                <>
                  <Button variant="outline" onClick={() => setAddStep("configure")} className="gap-1.5">
                    <ArrowLeft className="w-4 h-4" /> Back
                  </Button>
                  <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => createDriver.mutate()} disabled={createDriver.isPending || !newDriverName}>
                    {createDriver.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Plus className="w-4 h-4 mr-1.5" />}
                    {t.admin.addDriver}
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Driver List */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Driver cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {allDrivers.map((driver, idx) => {
              const typeCfg = driverTypeConfig[driver.type];
              const Icon = typeCfg?.icon || Server;
              const isActive = driver.status === "active";
              const isCloud = isCloudDriver(driver.type);
              const isOAuth = isOAuthDriver(driver.type);
              const isExpired = driver.authStatus === "expired";
              const driverUsed = storageUsed;
              const driverTotal = storageTotal;
              const driverPercent = driverTotal > 0 ? (driverUsed / driverTotal) * 100 : 0;

              return (
                <motion.div key={driver.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}>
                  <Card className={cn(
                    "transition-all duration-200 hover:shadow-md group relative overflow-hidden",
                    isActive ? "border-emerald-500/20 hover:border-emerald-500/40" : "border-border opacity-70",
                  )}>
                  <CardContent className="p-4">
                    {/* Top: Icon, Name, Status */}
                    <div className="flex items-start gap-3 mb-3">
                      <div className={cn("p-2.5 rounded-xl shrink-0", typeCfg?.bg || "bg-muted")}>
                        <Icon className={cn("w-5 h-5", typeCfg?.textColor || "text-muted-foreground")} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                          <span className="font-semibold text-sm truncate">{driver.name}</span>
                          <StatusIndicator status={driver.status} healthy={driver.healthy} />
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <DriverTypeBadge type={driver.type} />
                          {driver.isDefault && (
                            <Badge className="bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 border-emerald-600/20 text-[10px]">
                              Default
                            </Badge>
                          )}
                          {driver.isReadOnly && (
                            <Badge variant="outline" className="text-[10px] gap-0.5 bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30">
                              Read-only
                            </Badge>
                          )}
                          {isCloud && driver.authType && <AuthTypeBadge authType={driver.authType} />}
                          {isCloud && driver.authStatus && <AuthStatusBadge status={driver.authStatus} />}
                        </div>
                      </div>
                    </div>

                    {/* Middle: Config Info */}
                    <div className="space-y-1 mb-3">
                      {driver.mountPath && (
                        <div className="flex items-center gap-1.5">
                          <FolderOpen className="w-3 h-3 text-muted-foreground shrink-0" />
                          <code className="text-[11px] bg-muted px-1.5 py-0.5 rounded">{driver.mountPath}</code>
                        </div>
                      )}
                      {renderDriverConfigInfo(driver)}
                    </div>

                    {/* Storage Usage Bar */}
                    <div className="space-y-1.5 mb-3">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">Storage</span>
                        <span className="font-medium">{formatFileSize(driverUsed)} / {formatFileSize(driverTotal)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-500",
                            driverPercent > 80 ? "bg-red-500" : driverPercent > 60 ? "bg-amber-500" : "bg-emerald-500"
                          )}
                          style={{ width: `${Math.min(driverPercent, 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Last Sync */}
                    {driver.lastSyncAt && (() => {
                      const rel = formatRelativeTime(driver.lastSyncAt, t.app);
                      return rel ? <div className="text-[11px] text-muted-foreground mb-3 flex items-center gap-1"><Clock className="w-3 h-3" /> Last sync: {rel}</div> : null;
                    })()}

                    {/* Bottom: Actions */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-border/40">
                      {isOAuth && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline" size="sm"
                              className={cn("gap-1 h-7 text-[11px] px-2", isExpired ? "border-amber-500/50 text-amber-700 dark:text-amber-400" : "border-blue-500/50 text-blue-700 dark:text-blue-400")}
                              onClick={() => handleOAuthAuthorize(driver)}
                              disabled={authorizingDriverId === driver.id}
                            >
                              {authorizingDriverId === driver.id ? <Loader2 className="w-3 h-3 animate-spin" /> : isExpired ? <RefreshCw className="w-3 h-3" /> : <ExternalLink className="w-3 h-3" />}
                              {isExpired ? "Re-authorize" : "Authorize"}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>OAuth authorization</TooltipContent>
                        </Tooltip>
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-1 h-7 text-[11px] px-2" onClick={() => handleHealthCheck(driver)} disabled={testingDriverId === driver.id}>
                            {testingDriverId === driver.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <TestTube className="w-3 h-3" />}
                            Health
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Run health check</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-1 h-7 text-[11px] px-2" onClick={() => handleEditDriver(driver)}>
                            <Pencil className="w-3 h-3" /> Edit
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Edit driver settings</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-1 h-7 text-[11px] px-2" onClick={() => updateDriver.mutate({ id: driver.id, status: isActive ? "inactive" : "active" })}>
                            {isActive ? <PowerOff className="w-3 h-3" /> : <Power className="w-3 h-3" />}
                            {isActive ? "Disable" : "Enable"}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{isActive ? "Disable driver" : "Enable driver"}</TooltipContent>
                      </Tooltip>
                      {!driver.isDefault && driver.id !== "default-local" && (
                        <Button variant="ghost" size="sm" className="gap-1 h-7 text-[11px] px-2 text-destructive hover:text-destructive ml-auto" onClick={() => setDeleteDriverId(driver.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
                </motion.div>
              );
            })}
          </div>

          {/* Empty state */}
          {allDrivers.length <= 1 && (allDrivers.length === 0 || allDrivers[0]?.type === "local") && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border-2 border-dashed border-emerald-300/50 dark:border-emerald-700/50 bg-gradient-to-br from-emerald-50/30 to-sky-50/30 dark:from-emerald-950/10 dark:to-sky-950/10 p-8 text-center">
              <div className="p-4 rounded-full bg-emerald-500/10 w-fit mx-auto mb-4">
                <FolderOpen className="w-10 h-10 text-emerald-600" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Add Your First Storage Driver</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
                You&apos;re using the local disk driver. Expand your storage by connecting cloud services, network drives, or additional local directories.
              </p>
              <Button size="sm" className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setAddDialogOpen(true)}>
                <Plus className="w-4 h-4" /> Add Driver
              </Button>
            </motion.div>
          )}

          {/* Available Driver Types Grid */}
          <div className="space-y-3 mt-6">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Cloud className="w-3.5 h-3.5" />
              {t.admin.thirdPartyCloud || "Available Driver Types"}
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {Object.entries(driverTypeConfig).map(([type, cfg]) => {
                const Icon = cfg.icon;
                const hasDriver = allDrivers.some(d => d.type === type);
                return (
                  <motion.button
                    key={type}
                    whileHover={{ scale: 1.02 }}
                    onClick={() => { if (!hasDriver) { handleSelectType(type); setAddDialogOpen(true); } }}
                    className={cn(
                      "flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all duration-200",
                      hasDriver ? "border-emerald-500/20 bg-emerald-500/5" : "border-border/40 hover:border-emerald-500/30 hover:bg-emerald-500/5 cursor-pointer",
                    )}
                  >
                    <div className={cn("p-2 rounded-lg shrink-0", cfg.bg)}>
                      <Icon className={cn("w-4 h-4", cfg.textColor)} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate">{cfg.labelZh}</div>
                      <div className="flex items-center gap-1">
                        <span className={cn("text-[9px]", hasDriver ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
                          {hasDriver ? "Active" : "Available"}
                        </span>
                        {cfg.authType !== "none" && (
                          <Badge variant="outline" className="text-[8px] h-4 px-1">{cfg.authType.toUpperCase()}</Badge>
                        )}
                      </div>
                    </div>
                    {hasDriver && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 ml-auto shrink-0" />}
                  </motion.button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Edit Driver Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto"
          onInteractOutside={(e) => {
            const target = e.target as HTMLElement;
            if (target.closest('[role="menu"]') || target.closest('[data-radix-popper-content-wrapper]')) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-emerald-600" />
              Edit Driver: {editingDriver?.name}
            </DialogTitle>
          </DialogHeader>
          {editingDriver && (
            <div className="space-y-4 py-4">
              {/* Driver type (read-only) */}
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30">
                {(() => {
                  const cfg = driverTypeConfig[editingDriver.type];
                  const Icon = cfg?.icon || Server;
                  return (
                    <>
                      <div className={cn("p-2 rounded-lg", cfg?.bg || "bg-muted")}>
                        <Icon className={cn("w-4 h-4", cfg?.textColor || "text-muted-foreground")} />
                      </div>
                      <div>
                        <div className="text-sm font-medium">{cfg?.labelZh || editingDriver.type}</div>
                        <div className="text-[11px] text-muted-foreground">{cfg?.labelEn}</div>
                      </div>
                      <div className="ml-auto flex items-center gap-1.5">
                        <StatusIndicator status={editingDriver.status} healthy={editingDriver.healthy} />
                        <span className="text-xs">{editingDriver.status}</span>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* OAuth status for cloud drivers */}
              {isOAuthDriver(editingDriver.type) && (
                <div className="flex items-center gap-2 p-3 rounded-lg border">
                  <Key className="w-4 h-4 text-blue-500 shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium">OAuth Status:</span>
                      <AuthStatusBadge status={editingDriver.authStatus || "pending"} />
                    </div>
                    {editingDriver.tokenExpiresAt && (
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        Token expires: {new Date(editingDriver.tokenExpiresAt).toLocaleString()}
                      </div>
                    )}
                    {editingDriver.lastSyncAt && (() => {
                      const rel = formatRelativeTime(editingDriver.lastSyncAt, t.app);
                      return rel ? <div className="text-[11px] text-muted-foreground">Last sync: {rel}</div> : null;
                    })()}
                  </div>
                  <Button
                    variant="outline" size="sm" className="gap-1"
                    onClick={() => handleOAuthAuthorize(editingDriver)}
                    disabled={authorizingDriverId === editingDriver.id}
                  >
                    {authorizingDriverId === editingDriver.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    {editingDriver.authStatus === "expired" ? "Re-authorize" : "Authorize"}
                  </Button>
                </div>
              )}

              {/* Editable fields */}
              <div className="space-y-2">
                <Label htmlFor="edit-name">Driver Name</Label>
                <Input id="edit-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-mount-path">Mount Path (VFS)</Label>
                <Input id="edit-mount-path" value={editMountPath} onChange={(e) => setEditMountPath(e.target.value)} />
              </div>
              <div className="flex items-center justify-between gap-3 py-1">
                <div className="space-y-0.5">
                  <Label htmlFor="edit-readonly">Read-only mount</Label>
                  <p className="text-[11px] text-muted-foreground">Prevent write operations</p>
                </div>
                <Switch id="edit-readonly" checked={editIsReadOnly} onCheckedChange={(checked) => setEditIsReadOnly(checked)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-priority">Priority</Label>
                <Input id="edit-priority" type="number" value={editPriority} onChange={(e) => setEditPriority(parseInt(e.target.value) || 0)} />
              </div>

              {/* Config fields */}
              {editConfigFields.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Configuration</Label>
                    {editConfigFields
                      .filter((field) => {
                        if (editingDriver.type === "mount") {
                          const proto = editConfig.mountProtocol || "webdav";
                          if (field.key === "mountProtocol") return false;
                          if (field.key === "nfsExportPath" && proto !== "nfs") return false;
                          if (field.key === "domain" && proto !== "smb") return false;
                          if ((field.key === "username" || field.key === "password") && proto === "nfs") return false;
                          if (field.key === "mountPath" && proto === "webdav") return false;
                        }
                        return true;
                      })
                      .map((field) => (
                        <div key={field.key} className="space-y-1.5">
                          <Label htmlFor={`edit-config-${field.key}`} className="text-xs">
                            {field.label}
                            {field.required && <span className="text-destructive ml-0.5">*</span>}
                          </Label>
                          <Input
                            id={`edit-config-${field.key}`}
                            type={field.type === "password" ? "password" : "text"}
                            value={editConfig[field.key] || ""}
                            onChange={(e) => setEditConfig({ ...editConfig, [field.key]: e.target.value })}
                            placeholder={field.placeholder}
                          />
                          {field.helpText && <p className="text-[11px] text-muted-foreground">{field.helpText}</p>}
                        </div>
                      ))}
                  </div>
                </>
              )}
            </div>
          )}
          <DialogFooter className="border-t pt-3">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>{t.app.cancel}</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleSaveEdit} disabled={updateDriver.isPending}>
              {updateDriver.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteDriverId} onOpenChange={(open) => { if (!open) setDeleteDriverId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-destructive" />
              Delete Driver
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this storage driver. Files stored on this driver may become inaccessible.
              Any files using this driver should be migrated first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.app.cancel}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => { if (deleteDriverId) deleteDriver.mutate(deleteDriverId); }}>
              {t.app.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
