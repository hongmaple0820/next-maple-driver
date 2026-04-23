"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
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
  Cloud, Globe, Server, TestTube, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { motion, AnimatePresence } from "framer-motion";

interface DriverInfo {
  id: string;
  name: string;
  type: string;
  status: string;
  priority: number;
  isDefault: boolean;
  basePath: string;
  config: string;
  healthy?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

const driverTypeIcons: Record<string, typeof Server> = {
  local: Server,
  webdav: Globe,
  s3: Cloud,
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
};

export function AdminDriversTab() {
  const queryClient = useQueryClient();
  const { t } = useI18n();

  const driverTypeLabels: Record<string, string> = {
    local: t.admin.localStorage,
    webdav: t.admin.webdav,
    s3: "Amazon S3",
  };
  const [addDriverOpen, setAddDriverOpen] = useState(false);
  const [newDriverType, setNewDriverType] = useState("local");
  const [newDriverName, setNewDriverName] = useState("");
  const [newDriverBasePath, setNewDriverBasePath] = useState("./storage");
  const [newDriverPriority, setNewDriverPriority] = useState(0);
  const [newDriverIsDefault, setNewDriverIsDefault] = useState(false);
  const [newDriverConfig, setNewDriverConfig] = useState<Record<string, string>>({});
  const [testingDriverId, setTestingDriverId] = useState<string | null>(null);

  // Reset form when type changes
  const handleTypeChange = (type: string) => {
    setNewDriverType(type);
    setNewDriverConfig({});
    setNewDriverBasePath(type === "local" ? "./storage" : "");
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
    // Test connection for the new driver being configured
    toast.info("Test connection will be available after driver creation");
  };

  // Combine existing drivers with default driver info
  const allDrivers = drivers.length > 0
    ? drivers
    : defaultDriver
      ? [defaultDriver as DriverInfo]
      : [];

  const currentConfigFields = driverConfigFields[newDriverType] || [];

  return (
    <div className="space-y-4">
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
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
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

              {/* Driver Type */}
              <div className="space-y-2">
                <Label>{t.admin.type}</Label>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant={newDriverType === "local" ? "default" : "outline"}
                    size="sm"
                    className={cn(newDriverType === "local" && "bg-emerald-600 hover:bg-emerald-700")}
                    onClick={() => handleTypeChange("local")}
                  >
                    <Server className="w-4 h-4 mr-1.5" />
                    {t.admin.local}
                  </Button>
                  <Button
                    variant={newDriverType === "s3" ? "default" : "outline"}
                    size="sm"
                    className={cn(newDriverType === "s3" && "bg-emerald-600 hover:bg-emerald-700")}
                    onClick={() => handleTypeChange("s3")}
                  >
                    <Cloud className="w-4 h-4 mr-1.5" />
                    Amazon S3
                  </Button>
                  <Button
                    variant={newDriverType === "webdav" ? "default" : "outline"}
                    size="sm"
                    className={cn(newDriverType === "webdav" && "bg-emerald-600 hover:bg-emerald-700")}
                    onClick={() => handleTypeChange("webdav")}
                  >
                    <Globe className="w-4 h-4 mr-1.5" />
                    {t.admin.webdav}
                  </Button>
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
                  {currentConfigFields.map((field) => (
                    <div key={field.key} className="space-y-1.5">
                      <Label htmlFor={`config-${field.key}`} className="text-xs">
                        {field.label}
                        {field.required && <span className="text-destructive ml-0.5">*</span>}
                      </Label>
                      <Input
                        id={`config-${field.key}`}
                        type={field.type === "password" ? "password" : "text"}
                        value={newDriverConfig[field.key] || ""}
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
              {(newDriverType === "s3" || newDriverType === "webdav") && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={handleTestConnection}
                >
                  <TestTube className="w-4 h-4" />
                  Test Connection
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
                        </div>
                        <div className="text-sm text-muted-foreground space-y-0.5">
                          <div>{t.admin.type}: {driverTypeLabels[driver.type] || driver.type} · {t.admin.priority}: {driver.priority}</div>
                          {driver.type === "local" && driver.basePath && (
                            <div>{t.admin.basePath}: <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{driver.basePath}</code></div>
                          )}
                          {(driver.type === "s3" || driver.type === "webdav") && (() => {
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
                                return (
                                  <div>URL: <code className="text-xs bg-muted px-1 py-0.5 rounded">{config.url}</code></div>
                                );
                              }
                            } catch { /* ignore parse error */ }
                            return null;
                          })()}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
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

          {/* Driver Type Info Cards */}
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
        </div>
      )}
    </div>
  );
}
