"use client";

import { useState } from "react";
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
  Cloud, Globe, Server, TestTube,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

const driverTypeLabels: Record<string, string> = {
  local: "Local Storage",
  webdav: "WebDAV",
  s3: "Amazon S3",
};

const comingSoonTypes = ["webdav", "s3"];

export function AdminDriversTab() {
  const queryClient = useQueryClient();
  const [addDriverOpen, setAddDriverOpen] = useState(false);
  const [newDriver, setNewDriver] = useState({
    name: "",
    type: "local",
    basePath: "./storage",
    priority: 0,
    isDefault: false,
  });

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
    mutationFn: async (driverData: typeof newDriver) => {
      const res = await fetch("/api/admin/drivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(driverData),
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
      setNewDriver({ name: "", type: "local", basePath: "./storage", priority: 0, isDefault: false });
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

  const handleHealthCheck = (driver: DriverInfo) => {
    if (driver.type === "local") {
      if (driver.healthy) {
        toast.success(`"${driver.name}" is healthy and accessible`);
      } else {
        toast.error(`"${driver.name}" path is not accessible`);
      }
    } else {
      toast.info("Health check not available for this driver type yet");
    }
  };

  // Combine existing drivers with default driver info
  const allDrivers = drivers.length > 0
    ? drivers
    : defaultDriver
      ? [defaultDriver as DriverInfo]
      : [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">
            Manage storage backends for your CloudDrive instance
          </h3>
        </div>
        <Dialog open={addDriverOpen} onOpenChange={setAddDriverOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              <Plus className="w-4 h-4" />
              Add Driver
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Storage Driver</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="driver-name">Driver Name</Label>
                <Input
                  id="driver-name"
                  value={newDriver.name}
                  onChange={(e) => setNewDriver({ ...newDriver, name: e.target.value })}
                  placeholder="e.g., Primary Storage"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="driver-type">Type</Label>
                <div className="flex gap-2">
                  <Button
                    variant={newDriver.type === "local" ? "default" : "outline"}
                    size="sm"
                    className={cn(newDriver.type === "local" && "bg-emerald-600 hover:bg-emerald-700")}
                    onClick={() => setNewDriver({ ...newDriver, type: "local" })}
                  >
                    <Server className="w-4 h-4 mr-1.5" />
                    Local
                  </Button>
                  <Button variant="outline" size="sm" disabled className="opacity-50">
                    <Globe className="w-4 h-4 mr-1.5" />
                    WebDAV
                    <Badge variant="secondary" className="ml-1.5 text-[10px] px-1 py-0">Soon</Badge>
                  </Button>
                  <Button variant="outline" size="sm" disabled className="opacity-50">
                    <Cloud className="w-4 h-4 mr-1.5" />
                    S3
                    <Badge variant="secondary" className="ml-1.5 text-[10px] px-1 py-0">Soon</Badge>
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="driver-path">Base Path</Label>
                <Input
                  id="driver-path"
                  value={newDriver.basePath}
                  onChange={(e) => setNewDriver({ ...newDriver, basePath: e.target.value })}
                  placeholder="./storage"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="driver-priority">Priority</Label>
                  <Input
                    id="driver-priority"
                    type="number"
                    value={newDriver.priority}
                    onChange={(e) => setNewDriver({ ...newDriver, priority: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2 flex flex-col">
                  <Label>Default Driver</Label>
                  <div className="flex items-center gap-2 mt-2">
                    <Switch
                      checked={newDriver.isDefault}
                      onCheckedChange={(checked) => setNewDriver({ ...newDriver, isDefault: checked })}
                    />
                    <span className="text-sm text-muted-foreground">
                      {newDriver.isDefault ? "Yes" : "No"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => createDriver.mutate(newDriver)}
                disabled={createDriver.isPending || !newDriver.name}
              >
                {createDriver.isPending ? "Creating..." : "Create Driver"}
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
          {/* Active Drivers */}
          {allDrivers.map((driver) => {
            const Icon = driverTypeIcons[driver.type] || Server;
            const isActive = driver.status === "active";
            return (
              <Card key={driver.id} className={cn(
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
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold">{driver.name}</span>
                        {driver.isDefault && (
                          <Badge className="bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 border-emerald-600/20 text-[10px]">
                            Default
                          </Badge>
                        )}
                        <Badge variant={isActive ? "default" : "secondary"} className={cn(
                          "text-[10px]",
                          isActive && "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 border-emerald-600/20",
                        )}>
                          {isActive ? "Active" : "Inactive"}
                        </Badge>
                        {driver.healthy !== undefined && (
                          <Badge variant="outline" className={cn(
                            "text-[10px] gap-1",
                            driver.healthy ? "text-emerald-600 border-emerald-600/30" : "text-destructive border-destructive/30",
                          )}>
                            {driver.healthy ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                            {driver.healthy ? "Healthy" : "Unhealthy"}
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground space-y-0.5">
                        <div>Type: {driverTypeLabels[driver.type] || driver.type} · Priority: {driver.priority}</div>
                        {driver.basePath && <div>Path: <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{driver.basePath}</code></div>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => handleHealthCheck(driver)}
                      >
                        <TestTube className="w-3.5 h-3.5" />
                        Test
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
                        {isActive ? "Disable" : "Enable"}
                      </Button>
                      {!driver.isDefault && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => updateDriver.mutate({ id: driver.id, isDefault: true })}
                        >
                          <Settings2 className="w-3.5 h-3.5" />
                          Set Default
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
                              <AlertDialogTitle>Delete Driver</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete the <strong>{driver.name}</strong> driver?
                                This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive hover:bg-destructive/90"
                                onClick={() => deleteDriver.mutate(driver.id)}
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Coming Soon Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
            <Card className="opacity-60 border-dashed">
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2.5 rounded-xl bg-muted">
                    <Globe className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="font-semibold">WebDAV</div>
                    <Badge variant="secondary" className="text-[10px]">Coming Soon</Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Connect to WebDAV servers like Nextcloud, ownCloud, or any WebDAV-compatible service.
                </p>
              </CardContent>
            </Card>
            <Card className="opacity-60 border-dashed">
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2.5 rounded-xl bg-muted">
                    <Cloud className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="font-semibold">Amazon S3</div>
                    <Badge variant="secondary" className="text-[10px]">Coming Soon</Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Use Amazon S3 or compatible services (MinIO, DigitalOcean Spaces) as storage backend.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
