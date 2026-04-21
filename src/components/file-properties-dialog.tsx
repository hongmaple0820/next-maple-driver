"use client";

import { useFileStore } from "@/store/file-store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  File as FileIcon,
  Folder,
  Star,
  Trash2,
  Calendar,
  HardDrive,
  MapPin,
  Hash,
  StickyNote,
  Share2,
  Clock,
  ChevronRight,
} from "lucide-react";
import { FileTypeIcon } from "@/components/file-type-icon";
import { formatFileSize, getFileExtension, getFileTypeLabel } from "@/lib/file-utils";
import { useQuery } from "@tanstack/react-query";
import type { BreadcrumbItem } from "@/lib/file-utils";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface FileProperties {
  id: string;
  name: string;
  type: "folder" | "file";
  mimeType: string | null;
  size: number;
  createdAt: string;
  updatedAt: string;
  starred: boolean;
  trashed: boolean;
  description: string | null;
  parentId: string;
  md5Hash?: string | null;
  folderStats?: {
    totalSize: number;
    fileCount: number;
    folderCount: number;
  };
  shares?: Array<{
    id: string;
    token: string;
    downloadCount: number;
    createdAt: string;
    expiresAt: string | null;
  }>;
}

function formatExactDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  if (diffDays < 30) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths} month${diffMonths !== 1 ? "s" : ""} ago`;
}

function PropertyRow({
  icon,
  label,
  value,
  mono = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="text-muted-foreground mt-0.5 shrink-0">{icon}</span>
      <span className="text-sm text-muted-foreground w-28 shrink-0">{label}</span>
      <span className={`text-sm font-medium min-w-0 break-all ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </span>
    </div>
  );
}

export function FilePropertiesDialog() {
  const { propertiesFile, setPropertiesFile, setDetailFile } = useFileStore();
  const [showShareHistory, setShowShareHistory] = useState(false);

  const { data: properties, isLoading } = useQuery<FileProperties>({
    queryKey: ["file-properties", propertiesFile?.id],
    queryFn: async () => {
      if (!propertiesFile) return null as unknown as FileProperties;
      const res = await fetch(`/api/files/properties/${propertiesFile.id}`);
      if (!res.ok) throw new Error("Failed to fetch properties");
      return res.json();
    },
    enabled: !!propertiesFile,
  });

  // Fetch breadcrumb path for location
  const { data: breadcrumbs = [] } = useQuery<BreadcrumbItem[]>({
    queryKey: ["breadcrumb", properties?.parentId],
    queryFn: async () => {
      if (!properties || properties.parentId === "root") return [];
      const res = await fetch(`/api/files/path?id=${properties.parentId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!properties && properties.parentId !== "root",
  });

  const open = !!propertiesFile;

  const handleClose = () => {
    setPropertiesFile(null);
    setShowShareHistory(false);
  };

  const handleOpenDetail = () => {
    if (propertiesFile) {
      setPropertiesFile(null);
      // We need to find the file in the cache to set the detail panel
      // The detail panel fetches its own data, so just set the file info
      setDetailFile({
        id: propertiesFile.id,
        name: propertiesFile.name,
        type: properties?.type === "folder" ? "folder" : "file",
        mimeType: properties?.mimeType ?? undefined,
        size: properties?.size,
        parentId: properties?.parentId ?? "root",
        starred: properties?.starred ?? false,
        trashed: properties?.trashed ?? false,
        createdAt: properties?.createdAt ?? new Date().toISOString(),
        updatedAt: properties?.updatedAt ?? new Date().toISOString(),
        description: properties?.description ?? undefined,
      });
    }
  };

  const ext = propertiesFile ? getFileExtension(propertiesFile.name) : "";
  const isFolder = properties?.type === "folder";

  // Build location path
  const locationPath = properties
    ? properties.parentId === "root"
      ? "All Files"
      : [...breadcrumbs.map((b) => b.name)].join(" / ") || "All Files"
    : "";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-[520px] p-0 gap-0 max-h-[85vh]">
        <DialogHeader className="p-6 pb-4 border-b border-border/50">
          <DialogTitle className="flex items-center gap-3 text-base">
            {propertiesFile && (
              <FileTypeIcon
                file={{
                  id: propertiesFile.id,
                  name: propertiesFile.name,
                  type: properties?.type === "folder" ? "folder" : "file",
                  mimeType: properties?.mimeType ?? undefined,
                }}
                className="w-8 h-8"
                strokeWidth={1.5}
              />
            )}
            <div className="flex items-center gap-2 min-w-0">
              <span className="truncate max-w-[280px]">{propertiesFile?.name}</span>
              {ext && !isFolder && (
                <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0 h-5 font-mono">
                  .{ext}
                </Badge>
              )}
            </div>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Properties for {propertiesFile?.name}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(85vh-80px)]">
          {isLoading ? (
            <div className="p-6 space-y-4">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : properties ? (
            <div className="p-6 space-y-5">
              {/* File Information Section */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  File Information
                </h4>
                <div className="space-y-0.5">
                  <PropertyRow
                    icon={<FileIcon className="w-4 h-4" />}
                    label="Type"
                    value={isFolder ? "Folder" : getFileTypeLabel({ type: properties.type, name: properties.name, mimeType: properties.mimeType ?? undefined })}
                  />
                  {properties.mimeType && (
                    <PropertyRow
                      icon={<FileIcon className="w-4 h-4" />}
                      label="MIME Type"
                      value={properties.mimeType}
                      mono
                    />
                  )}
                  {!isFolder && (
                    <PropertyRow
                      icon={<HardDrive className="w-4 h-4" />}
                      label="Size"
                      value={
                        <span>
                          {formatFileSize(properties.size)}
                          <span className="text-muted-foreground ml-1.5 text-xs">
                            ({properties.size.toLocaleString()} bytes)
                          </span>
                        </span>
                      }
                    />
                  )}
                  {ext && !isFolder && (
                    <PropertyRow
                      icon={<FileIcon className="w-4 h-4" />}
                      label="Extension"
                      value={
                        <Badge variant="outline" className="font-mono text-xs">
                          .{ext}
                        </Badge>
                      }
                    />
                  )}
                </div>
              </div>

              <Separator />

              {/* Folder Stats Section */}
              {isFolder && properties.folderStats && (
                <>
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                      Folder Contents
                    </h4>
                    <div className="space-y-0.5">
                      <PropertyRow
                        icon={<HardDrive className="w-4 h-4" />}
                        label="Total Size"
                        value={
                          <span>
                            {formatFileSize(properties.folderStats.totalSize)}
                            <span className="text-muted-foreground ml-1.5 text-xs">
                              ({properties.folderStats.totalSize.toLocaleString()} bytes)
                            </span>
                          </span>
                        }
                      />
                      <PropertyRow
                        icon={<FileIcon className="w-4 h-4" />}
                        label="Files"
                        value={`${properties.folderStats.fileCount} file${properties.folderStats.fileCount !== 1 ? "s" : ""}`}
                      />
                      <PropertyRow
                        icon={<Folder className="w-4 h-4" />}
                        label="Subfolders"
                        value={`${properties.folderStats.folderCount} folder${properties.folderStats.folderCount !== 1 ? "s" : ""}`}
                      />
                    </div>
                  </div>
                  <Separator />
                </>
              )}

              {/* Location Section */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Location
                </h4>
                <div className="space-y-0.5">
                  <PropertyRow
                    icon={<MapPin className="w-4 h-4" />}
                    label="Path"
                    value={
                      <span className="flex items-center gap-1 text-sm">
                        <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span>
                          {locationPath === "All Files" ? (
                            "All Files (root)"
                          ) : (
                            <>
                              All Files{" "}
                              {breadcrumbs.map((b, i) => (
                                <span key={b.id} className="inline-flex items-center gap-0.5">
                                  <ChevronRight className="w-3 h-3 text-muted-foreground/50 mx-0.5" />
                                  {b.name}
                                </span>
                              ))}
                            </>
                          )}
                        </span>
                      </span>
                    }
                  />
                </div>
              </div>

              <Separator />

              {/* Dates Section */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Dates
                </h4>
                <div className="space-y-0.5">
                  <PropertyRow
                    icon={<Calendar className="w-4 h-4" />}
                    label="Created"
                    value={
                      <span>
                        {formatExactDate(properties.createdAt)}
                        <span className="text-muted-foreground ml-1.5 text-xs">
                          ({formatTimeAgo(properties.createdAt)})
                        </span>
                      </span>
                    }
                  />
                  <PropertyRow
                    icon={<Clock className="w-4 h-4" />}
                    label="Modified"
                    value={
                      <span>
                        {formatExactDate(properties.updatedAt)}
                        <span className="text-muted-foreground ml-1.5 text-xs">
                          ({formatTimeAgo(properties.updatedAt)})
                        </span>
                      </span>
                    }
                  />
                </div>
              </div>

              <Separator />

              {/* Attributes Section */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Attributes
                </h4>
                <div className="space-y-0.5">
                  <PropertyRow
                    icon={<Star className={`w-4 h-4 ${properties.starred ? "fill-yellow-400 text-yellow-400" : ""}`} />}
                    label="Starred"
                    value={properties.starred ? "Yes" : "No"}
                  />
                  <PropertyRow
                    icon={<Trash2 className={`w-4 h-4 ${properties.trashed ? "text-destructive" : ""}`} />}
                    label="Trashed"
                    value={properties.trashed ? "Yes" : "No"}
                  />
                  {properties.description && (
                    <PropertyRow
                      icon={<StickyNote className="w-4 h-4" />}
                      label="Description"
                      value={
                        <span className="flex items-center gap-2">
                          <span className="line-clamp-2">{properties.description}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-1.5 text-xs text-emerald-600 hover:text-emerald-700 shrink-0"
                            onClick={handleOpenDetail}
                          >
                            Edit
                          </Button>
                        </span>
                      }
                    />
                  )}
                  {!properties.description && (
                    <PropertyRow
                      icon={<StickyNote className="w-4 h-4" />}
                      label="Description"
                      value={
                        <Button
                          variant="link"
                          size="sm"
                          className="h-6 px-0 text-xs text-emerald-600 hover:text-emerald-700"
                          onClick={handleOpenDetail}
                        >
                          Add description
                        </Button>
                      }
                    />
                  )}
                </div>
              </div>

              {/* MD5 Hash (files only) */}
              {!isFolder && properties.md5Hash && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                      Checksum
                    </h4>
                    <div className="space-y-0.5">
                      <PropertyRow
                        icon={<Hash className="w-4 h-4" />}
                        label="MD5"
                        value={
                          <span className="flex items-center gap-2">
                            <code className="text-xs font-mono bg-muted px-2 py-1 rounded break-all">
                              {properties.md5Hash}
                            </code>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1.5 text-xs shrink-0"
                              onClick={() => {
                                navigator.clipboard.writeText(properties.md5Hash!);
                              }}
                            >
                              Copy
                            </Button>
                          </span>
                        }
                        mono
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Share History */}
              {properties.shares && properties.shares.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <button
                      className="flex items-center gap-2 w-full text-left mb-3"
                      onClick={() => setShowShareHistory(!showShareHistory)}
                    >
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Share History
                      </h4>
                      <span className="text-xs text-muted-foreground">
                        ({properties.shares.length})
                      </span>
                      <ChevronRight
                        className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${
                          showShareHistory ? "rotate-90" : ""
                        }`}
                      />
                    </button>
                    {showShareHistory && (
                      <div className="space-y-2">
                        {properties.shares.map((share) => (
                          <div
                            key={share.id}
                            className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/50 text-sm"
                          >
                            <Share2 className="w-4 h-4 text-purple-500 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <code className="text-xs font-mono truncate">
                                  {share.token}
                                </code>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                                <span>{share.downloadCount} download{share.downloadCount !== 1 ? "s" : ""}</span>
                                <span>{formatExactDate(share.createdAt)}</span>
                                {share.expiresAt && (
                                  <span className={new Date(share.expiresAt) < new Date() ? "text-destructive" : ""}>
                                    {new Date(share.expiresAt) < new Date() ? "Expired" : `Expires ${formatTimeAgo(share.expiresAt)}`}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : null}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
