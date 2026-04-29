"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Cloud, HardDrive, Key, ShieldCheck, ShieldAlert,
  Loader2, Save, CheckCircle2, XCircle, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Provider visual config
const PROVIDER_VISUAL: Record<string, {
  icon: typeof Cloud;
  color: string;
  bgColor: string;
  label: string;
}> = {
  baidu: { icon: Cloud, color: "text-blue-500", bgColor: "bg-blue-500/10", label: "百度网盘" },
  aliyun: { icon: Cloud, color: "text-orange-500", bgColor: "bg-orange-500/10", label: "阿里云盘" },
  onedrive: { icon: Cloud, color: "text-sky-500", bgColor: "bg-sky-500/10", label: "OneDrive" },
  google: { icon: Cloud, color: "text-red-500", bgColor: "bg-red-500/10", label: "Google Drive" },
  "115": { icon: HardDrive, color: "text-amber-600", bgColor: "bg-amber-600/10", label: "115网盘" },
  quark: { icon: HardDrive, color: "text-purple-500", bgColor: "bg-purple-500/10", label: "夸克网盘" },
};

interface ProviderConfig {
  label: string;
  description: string;
  authType: string;
  configured: boolean;
  clientId?: string;
  redirectUri?: string;
  tenantId?: string;
  oauthFields: string[];
}

export function CloudProvidersSection() {
  const queryClient = useQueryClient();
  const [editValues, setEditValues] = useState<Record<string, Record<string, string>>>({});
  const [saveLoading, setSaveLoading] = useState(false);

  // Fetch current provider configs
  const { data, isLoading } = useQuery({
    queryKey: ["cloud-providers"],
    queryFn: async () => {
      const res = await fetch("/api/admin/cloud-providers");
      if (!res.ok) throw new Error("获取云服务商配置失败");
      return res.json();
    },
  });

  const providers: Record<string, ProviderConfig> = data?.providers || {};

  // Initialize edit values from fetched data
  useEffect(() => {
    if (data?.providers) {
      const initialValues: Record<string, Record<string, string>> = {};
      for (const [type, config] of Object.entries(data.providers as Record<string, ProviderConfig>)) {
        initialValues[type] = {
          clientId: config.clientId || "",
          clientSecret: "", // Never pre-fill secrets
          redirectUri: config.redirectUri || "",
          tenantId: config.tenantId || "",
        };
      }
      setEditValues(initialValues);
    }
  }, [data]);

  // Save handler
  const handleSave = async () => {
    setSaveLoading(true);
    try {
      // Only send OAuth providers
      const oauthProviders: Record<string, Record<string, string>> = {};
      for (const [type, values] of Object.entries(editValues)) {
        const providerInfo = providers[type];
        if (providerInfo?.authType === "oauth") {
          oauthProviders[type] = { ...values };
        }
      }

      const res = await fetch("/api/admin/cloud-providers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providers: oauthProviders }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "保存失败" }));
        throw new Error(err.error || "保存失败");
      }

      const result = await res.json();

      // Check for errors
      const errors: string[] = [];
      for (const [type, r] of Object.entries(result.results || {})) {
        const rr = r as { success: boolean; error?: string };
        if (!rr.success) {
          errors.push(`${PROVIDER_VISUAL[type]?.label || type}: ${rr.error}`);
        }
      }

      if (errors.length > 0) {
        toast.error(`部分配置保存失败: ${errors.join("; ")}`);
      } else {
        toast.success("云服务商配置已保存");
        queryClient.invalidateQueries({ queryKey: ["cloud-providers"] });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaveLoading(false);
    }
  };

  const updateEditValue = (type: string, field: string, value: string) => {
    setEditValues((prev) => ({
      ...prev,
      [type]: {
        ...prev[type],
        [field]: value,
      },
    }));
  };

  // OAuth providers (ordered)
  const oauthProviderTypes = ["baidu", "aliyun", "onedrive", "google"];
  // Cookie-based providers
  const cookieProviderTypes = ["115", "quark"];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-emerald-500/10">
            <Cloud className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <CardTitle className="text-base">云服务商配置</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              配置各云盘的 OAuth 凭据，供所有用户共享使用
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 rounded-lg bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* OAuth Providers */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-blue-500" />
                OAuth 授权服务
              </h4>

              {oauthProviderTypes.map((type) => {
                const provider = providers[type];
                const visual = PROVIDER_VISUAL[type];
                if (!provider || !visual) return null;
                const Icon = visual.icon;
                const editVal = editValues[type] || {};

                return (
                  <div
                    key={type}
                    className="rounded-lg border border-border/60 p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className={cn("w-8 h-8 rounded-md flex items-center justify-center", visual.bgColor)}>
                          <Icon className={cn("w-4 h-4", visual.color)} />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{provider.label}</p>
                          <p className="text-[11px] text-muted-foreground">{provider.description}</p>
                        </div>
                      </div>
                      {provider.configured ? (
                        <Badge variant="outline" className="text-[10px] gap-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
                          <ShieldCheck className="w-3 h-3" />
                          已配置
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] gap-1 bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30">
                          <ShieldAlert className="w-3 h-3" />
                          未配置
                        </Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Client ID</Label>
                        <Input
                          placeholder="输入 Client ID..."
                          value={editVal.clientId || ""}
                          onChange={(e) => updateEditValue(type, "clientId", e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Client Secret</Label>
                        <Input
                          type="password"
                          placeholder={provider.configured ? "•••••••• (已保存)" : "输入 Client Secret..."}
                          value={editVal.clientSecret || ""}
                          onChange={(e) => updateEditValue(type, "clientSecret", e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                      {provider.oauthFields.includes("redirectUri") && (
                        <div className="space-y-1.5">
                          <Label className="text-xs">回调地址 (可选)</Label>
                          <Input
                            placeholder="留空使用默认回调地址"
                            value={editVal.redirectUri || ""}
                            onChange={(e) => updateEditValue(type, "redirectUri", e.target.value)}
                            className="h-8 text-xs"
                          />
                        </div>
                      )}
                      {provider.oauthFields.includes("tenantId") && (
                        <div className="space-y-1.5">
                          <Label className="text-xs">Tenant ID (可选)</Label>
                          <Input
                            placeholder="common"
                            value={editVal.tenantId || ""}
                            onChange={(e) => updateEditValue(type, "tenantId", e.target.value)}
                            className="h-8 text-xs"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <Separator />

            {/* Cookie-based Providers */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-amber-500" />
                Cookie / 扫码登录服务
              </h4>

              <Alert className="border-blue-500/20 bg-blue-500/5">
                <Info className="w-4 h-4 text-blue-500" />
                <AlertDescription className="text-xs">
                  这类网盘不支持 OAuth 授权，用户需要通过浏览器 Cookie 或手机扫码方式登录。
                  无需在此配置全局凭据。
                </AlertDescription>
              </Alert>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {cookieProviderTypes.map((type) => {
                  const provider = providers[type];
                  const visual = PROVIDER_VISUAL[type];
                  if (!provider || !visual) return null;
                  const Icon = visual.icon;

                  return (
                    <div
                      key={type}
                      className="rounded-lg border border-border/60 p-3 flex items-center gap-3"
                    >
                      <div className={cn("w-10 h-10 rounded-md flex items-center justify-center shrink-0", visual.bgColor)}>
                        <Icon className={cn("w-5 h-5", visual.color)} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{provider.label}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{provider.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* Save button */}
            <div className="flex items-center justify-end gap-3">
              <Button
                onClick={handleSave}
                disabled={saveLoading}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700"
              >
                {saveLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                保存配置
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
