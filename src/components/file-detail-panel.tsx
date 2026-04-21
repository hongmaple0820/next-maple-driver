"use client";

import { useState, useRef, useEffect } from "react";
import { useFileStore } from "@/store/file-store";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Download, Star, Trash2, Share2, Pencil, File as FileIcon, Calendar, HardDrive, MapPin, StickyNote, Check, X as XIcon,
} from "lucide-react";
import { FileTypeIcon } from "@/components/file-type-icon";
import { formatFileSize, formatDate, getFileTypeLabel, getFileExtension, getFileNameWithoutExtension } from "@/lib/file-utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import type { BreadcrumbItem } from "@/lib/file-utils";
import { FileVersionPanel } from "@/components/file-version-panel";

function InfoRow({ icon, label, value, delay = 0 }: { icon: React.ReactNode; label: string; value: string; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, delay }}
      className="flex items-center gap-2"
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-sm text-muted-foreground w-20">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </motion.div>
  );
}

export function FileDetailPanel() {
  const { detailFile, setDetailFile, setRenameFile, setShareFile, setPreviewFile, section } = useFileStore();
  const queryClient = useQueryClient();
  const [imageZoomed, setImageZoomed] = useState(false);
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState("");
  const [isSavingDesc, setIsSavingDesc] = useState(false);
  const descTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync descValue when detailFile changes
  useEffect(() => {
    if (detailFile) {
      setDescValue(detailFile.description || "");
      setIsEditingDesc(false);
    }
  }, [detailFile]);

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (isEditingDesc && descTextareaRef.current) {
      descTextareaRef.current.focus();
      descTextareaRef.current.setSelectionRange(
        descTextareaRef.current.value.length,
        descTextareaRef.current.value.length
      );
    }
  }, [isEditingDesc]);

  const handleSaveDescription = async () => {
    if (!detailFile) return;
    setIsSavingDesc(true);
    try {
      const res = await fetch("/api/files", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: detailFile.id, description: descValue.trim() || null }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["files"] });
        setIsEditingDesc(false);
      } else {
        toast.error("Failed to save description");
      }
    } catch {
      toast.error("Failed to save description");
    } finally {
      setIsSavingDesc(false);
    }
  };

  const handleCancelDescription = () => {
    setDescValue(detailFile?.description || "");
    setIsEditingDesc(false);
  };

  // Fetch folder path for the "Location" info
  const { data: breadcrumbs = [] } = useQuery<BreadcrumbItem[]>({
    queryKey: ["breadcrumb", detailFile?.parentId],
    queryFn: async () => {
      if (!detailFile || detailFile.parentId === "root") return [];
      const res = await fetch(`/api/files/path?id=${detailFile.parentId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!detailFile && detailFile.parentId !== "root",
  });

  if (!detailFile) return null;

  const isFolder = detailFile.type === "folder";
  const isImage = !isFolder && detailFile.mimeType?.startsWith("image/");
  const ext = getFileExtension(detailFile.name);

  // Build location path string
  const locationPath = detailFile.parentId === "root"
    ? "All Files"
    : [...breadcrumbs.map(b => b.name), detailFile.parentId === "root" ? "All Files" : ""].filter(Boolean).join(" / ");

  const handleDownload = () => {
    window.open(`/api/files/download?id=${detailFile.id}`, "_blank");
  };

  const handlePreview = () => {
    setPreviewFile({
      id: detailFile.id,
      name: detailFile.name,
      type: detailFile.type,
      mimeType: detailFile.mimeType,
    });
    setDetailFile(null);
  };

  const handleDelete = async () => {
    if (!detailFile) return;
    try {
      const res = await fetch("/api/files", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: detailFile.id, permanent: section === "trash" }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["files"] });
        queryClient.invalidateQueries({ queryKey: ["storage-stats"] });
        setDetailFile(null);
      }
    } catch {
      // Error handled silently
    }
  };

  return (
    <>
      <Sheet open={!!detailFile} onOpenChange={(open) => !open && setDetailFile(null)}>
        <SheetContent side="right" className="w-[340px] sm:w-[380px] p-0 sm:max-w-[380px]">
          <SheetHeader className="p-6 pb-4 border-b border-border/50">
            <div className="flex items-start justify-between">
              <SheetTitle className="flex items-center gap-3 text-base">
                <FileTypeIcon file={detailFile} className="w-8 h-8" strokeWidth={1.5} />
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate max-w-[140px] sm:max-w-[180px]">
                    {ext && !isFolder ? getFileNameWithoutExtension(detailFile.name) : detailFile.name}
                  </span>
                  {ext && !isFolder && (
                    <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0 h-5 font-mono">
                      .{ext}
                    </Badge>
                  )}
                </div>
              </SheetTitle>
            </div>
            <SheetDescription className="sr-only">
              File details for {detailFile.name}
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="h-[calc(100vh-80px)]">
            {/* Preview thumbnail for images */}
            {isImage && (
              <div className="p-4 border-b border-border/50">
                <div
                  className="w-full h-64 rounded-lg overflow-hidden bg-muted cursor-pointer hover:opacity-90 transition-opacity relative group"
                  onClick={() => setImageZoomed(true)}
                >
                  <img
                    src={`/api/files/download?id=${detailFile.id}&mode=inline`}
                    alt={detailFile.name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                    <span className="text-white opacity-0 group-hover:opacity-100 transition-opacity text-sm font-medium bg-black/40 px-3 py-1.5 rounded-full">
                      Click to zoom
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="p-4 border-b border-border/50"
            >
              <div className="grid grid-cols-5 gap-2">
                {!isFolder && (
                  <button
                    onClick={handleDownload}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-lg hover:bg-muted transition-colors"
                  >
                    <Download className="w-5 h-5 text-emerald-600" />
                    <span className="text-[11px] text-muted-foreground">Download</span>
                  </button>
                )}
                <button
                  onClick={handlePreview}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-lg hover:bg-muted transition-colors"
                >
                  <FileIcon className="w-5 h-5 text-sky-500" />
                  <span className="text-[11px] text-muted-foreground">Preview</span>
                </button>
                <button
                  onClick={() => { setRenameFile({ id: detailFile.id, name: detailFile.name }); setDetailFile(null); }}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-lg hover:bg-muted transition-colors"
                >
                  <Pencil className="w-5 h-5 text-amber-500" />
                  <span className="text-[11px] text-muted-foreground">Rename</span>
                </button>
                <button
                  onClick={() => { setShareFile({ id: detailFile.id, name: detailFile.name }); setDetailFile(null); }}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-lg hover:bg-muted transition-colors"
                >
                  <Share2 className="w-5 h-5 text-purple-500" />
                  <span className="text-[11px] text-muted-foreground">Share</span>
                </button>
                <button
                  onClick={handleDelete}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-lg hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="w-5 h-5 text-destructive" />
                  <span className="text-[11px] text-destructive">Delete</span>
                </button>
              </div>
            </motion.div>

            {/* File Info */}
            <div className="p-4 space-y-4 border-b border-border/50">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Details</h4>

              <div className="space-y-3">
                <InfoRow icon={<FileIcon className="w-4 h-4" />} label="Type" value={getFileTypeLabel(detailFile)} delay={0} />
                {!isFolder && (
                  <InfoRow icon={<HardDrive className="w-4 h-4" />} label="Size" value={formatFileSize(detailFile.size)} delay={0.03} />
                )}
                <InfoRow icon={<MapPin className="w-4 h-4" />} label="Location" value={locationPath || "All Files"} delay={0.06} />
                <InfoRow icon={<Calendar className="w-4 h-4" />} label="Modified" value={formatDate(detailFile.updatedAt)} delay={0.09} />
                <InfoRow icon={<Calendar className="w-4 h-4" />} label="Created" value={formatDate(detailFile.createdAt)} delay={0.12} />
                {detailFile.mimeType && (
                  <InfoRow icon={<FileIcon className="w-4 h-4" />} label="MIME Type" value={detailFile.mimeType} delay={0.15} />
                )}
                {detailFile.starred && (
                  <motion.div
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: 0.18 }}
                    className="flex items-center gap-2"
                  >
                    <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                    <span className="text-sm text-muted-foreground">Starred</span>
                  </motion.div>
                )}
              </div>
            </div>

            {/* Version History (files only) */}
            {!isFolder && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: 0.2 }}
                className="p-4 border-b border-border/50"
              >
                <FileVersionPanel fileId={detailFile.id} />
              </motion.div>
            )}

            {/* Description / Notes */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: 0.25 }}
              className="p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <StickyNote className="w-3.5 h-3.5" />
                  Description
                </h4>
                {!isEditingDesc && (
                  <button
                    onClick={() => setIsEditingDesc(true)}
                    className="p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    title="Edit description"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {isEditingDesc ? (
                <div className="space-y-2">
                  <textarea
                    ref={descTextareaRef}
                    value={descValue}
                    onChange={(e) => setDescValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        handleSaveDescription();
                      }
                      if (e.key === "Escape") {
                        handleCancelDescription();
                      }
                    }}
                    placeholder="Add a description or notes..."
                    className="w-full min-h-[80px] text-sm rounded-md border border-input bg-background px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 transition-shadow"
                    disabled={isSavingDesc}
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">Ctrl+Enter to save · Esc to cancel</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={handleCancelDescription}
                        className="p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        disabled={isSavingDesc}
                      >
                        <XIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={handleSaveDescription}
                        className="p-1 rounded-md hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors text-emerald-600 hover:text-emerald-700"
                        disabled={isSavingDesc}
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => setIsEditingDesc(true)}
                  className="text-sm text-muted-foreground cursor-pointer hover:bg-muted/50 rounded-md p-2 -m-2 transition-colors min-h-[40px]"
                >
                  {detailFile.description ? (
                    <span className="whitespace-pre-wrap">{detailFile.description}</span>
                  ) : (
                    <span className="italic">Add a description or notes...</span>
                  )}
                </div>
              )}
            </motion.div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Image zoom lightbox */}
      <AnimatePresence>
        {imageZoomed && isImage && detailFile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8"
            onClick={() => setImageZoomed(false)}
          >
            <motion.img
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.8 }}
              src={`/api/files/download?id=${detailFile.id}&mode=inline`}
              alt={detailFile.name}
              className="max-w-full max-h-full object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
