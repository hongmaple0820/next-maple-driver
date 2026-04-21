"use client";

import { useFileStore } from "@/store/file-store";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Download, Star, Trash2, Share2, Pencil, File as FileIcon, Calendar, HardDrive,
} from "lucide-react";
import { FileTypeIcon } from "@/components/file-type-icon";
import { formatFileSize, formatDate, getFileTypeLabel, type FileItem } from "@/lib/file-utils";

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-sm text-muted-foreground w-20">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

export function FileDetailPanel() {
  const { detailFile, setDetailFile, setRenameFile, setShareFile, setPreviewFile } = useFileStore();

  if (!detailFile) return null;

  const isFolder = detailFile.type === "folder";
  const isImage = !isFolder && detailFile.mimeType?.startsWith("image/");

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

  return (
    <Sheet open={!!detailFile} onOpenChange={(open) => !open && setDetailFile(null)}>
      <SheetContent side="right" className="w-[380px] p-0 sm:max-w-[380px]">
        <SheetHeader className="p-6 pb-4 border-b">
          <div className="flex items-start justify-between">
            <SheetTitle className="flex items-center gap-3 text-base">
              <FileTypeIcon file={detailFile} className="w-8 h-8" strokeWidth={1.5} />
              <span className="truncate max-w-[220px]">{detailFile.name}</span>
            </SheetTitle>
          </div>
          <SheetDescription className="sr-only">
            File details for {detailFile.name}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-80px)]">
          {/* Preview thumbnail for images */}
          {isImage && (
            <div className="p-4 border-b">
              <div
                className="w-full h-48 rounded-lg overflow-hidden bg-muted cursor-pointer hover:opacity-90 transition-opacity"
                onClick={handlePreview}
              >
                <img
                  src={`/api/files/download?id=${detailFile.id}&mode=inline`}
                  alt={detailFile.name}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="p-4 border-b">
            <div className="grid grid-cols-4 gap-2">
              {!isFolder && (
                <button
                  onClick={handleDownload}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-lg hover:bg-muted transition-colors"
                >
                  <Download className="w-5 h-5 text-emerald-600" />
                  <span className="text-xs text-muted-foreground">Download</span>
                </button>
              )}
              <button
                onClick={handlePreview}
                className="flex flex-col items-center gap-1.5 p-3 rounded-lg hover:bg-muted transition-colors"
              >
                <FileIcon className="w-5 h-5 text-sky-500" />
                <span className="text-xs text-muted-foreground">Preview</span>
              </button>
              <button
                onClick={() => { setRenameFile({ id: detailFile.id, name: detailFile.name }); setDetailFile(null); }}
                className="flex flex-col items-center gap-1.5 p-3 rounded-lg hover:bg-muted transition-colors"
              >
                <Pencil className="w-5 h-5 text-amber-500" />
                <span className="text-xs text-muted-foreground">Rename</span>
              </button>
              <button
                onClick={() => { setShareFile({ id: detailFile.id, name: detailFile.name }); setDetailFile(null); }}
                className="flex flex-col items-center gap-1.5 p-3 rounded-lg hover:bg-muted transition-colors"
              >
                <Share2 className="w-5 h-5 text-purple-500" />
                <span className="text-xs text-muted-foreground">Share</span>
              </button>
            </div>
          </div>

          {/* File Info */}
          <div className="p-4 space-y-4">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Details</h4>

            <div className="space-y-3">
              <InfoRow icon={<FileIcon className="w-4 h-4" />} label="Type" value={getFileTypeLabel(detailFile)} />
              {!isFolder && (
                <InfoRow icon={<HardDrive className="w-4 h-4" />} label="Size" value={formatFileSize(detailFile.size)} />
              )}
              <InfoRow icon={<Calendar className="w-4 h-4" />} label="Modified" value={formatDate(detailFile.updatedAt)} />
              <InfoRow icon={<Calendar className="w-4 h-4" />} label="Created" value={formatDate(detailFile.createdAt)} />
              {detailFile.mimeType && (
                <InfoRow icon={<FileIcon className="w-4 h-4" />} label="MIME Type" value={detailFile.mimeType} />
              )}
              {detailFile.starred && (
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  <span className="text-sm text-muted-foreground">Starred</span>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
