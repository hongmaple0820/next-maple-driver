"use client";

import { useFileStore } from "@/store/file-store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";
import { FileTypeIconByProps } from "@/components/file-type-icon";
import { TextPreviewContent } from "@/components/text-preview-content";
import { VideoPlayer } from "@/components/video-player";
import { getPreviewType, type FileItem, type PreviewType } from "@/lib/file-utils";
import { useI18n } from "@/lib/i18n";

export function FilePreview() {
  const { previewFile, setPreviewFile } = useFileStore();
  const { t } = useI18n();

  const handleOpenChange = (open: boolean) => {
    if (!open) setPreviewFile(null);
  };

  if (!previewFile) return null;

  const previewType: PreviewType = getPreviewType({
    ...previewFile,
    type: previewFile.type as "file" | "folder",
    mimeType: previewFile.mimeType,
  } as FileItem);

  const handleDownload = () => {
    window.open(`/api/files/download?id=${previewFile.id}`, "_blank");
  };

  const renderPreview = () => {
    switch (previewType) {
      case "image":
        return (
          <div className="flex items-center justify-center p-4 min-h-[300px]">
            <img
              src={`/api/files/download?id=${previewFile.id}&mode=inline`}
              alt={previewFile.name}
              className="max-w-full max-h-[70vh] object-contain rounded-lg"
            />
          </div>
        );

      case "video":
        return (
          <div className="flex items-center justify-center p-4 min-h-[300px]">
            <VideoPlayer
              src={`/api/files/download?id=${previewFile.id}&mode=inline`}
              className="max-w-full max-h-[70vh]"
            />
          </div>
        );

      case "audio":
        return (
          <div className="flex flex-col items-center justify-center p-8 gap-4 min-h-[200px]">
            <FileTypeIconByProps
              type={previewFile.type as "folder" | "file"}
              mimeType={previewFile.mimeType}
              name={previewFile.name}
              className="w-20 h-20"
              strokeWidth={1}
            />
            <p className="text-sm font-medium">{previewFile.name}</p>
            <audio
              src={`/api/files/download?id=${previewFile.id}&mode=inline`}
              controls
              className="w-full max-w-md"
            >
              Your browser does not support audio playback.
            </audio>
          </div>
        );

      case "pdf":
        return (
          <div className="w-full h-[70vh]">
            <iframe
              src={`/api/files/download?id=${previewFile.id}&mode=inline`}
              className="w-full h-full border-none rounded-lg"
              title={previewFile.name}
            >
              <div className="flex flex-col items-center justify-center p-8 gap-4 min-h-[300px]">
                <FileTypeIconByProps
                  type={previewFile.type as "folder" | "file"}
                  mimeType={previewFile.mimeType}
                  name={previewFile.name}
                  className="w-20 h-20"
                  strokeWidth={1}
                />
                <p className="text-sm text-muted-foreground">
                  Your browser does not support embedded PDF viewing.
                </p>
                <Button variant="outline" onClick={handleDownload} className="gap-2">
                  <Download className="w-4 h-4" /> Download PDF to view
                </Button>
              </div>
            </iframe>
          </div>
        );

      case "text":
        return <TextPreviewContent key={previewFile.id} fileId={previewFile.id} />;

      default:
        return (
          <div className="flex flex-col items-center justify-center p-8 gap-4 min-h-[300px]">
            <FileTypeIconByProps
              type={previewFile.type as "folder" | "file"}
              mimeType={previewFile.mimeType}
              name={previewFile.name}
              className="w-20 h-20"
              strokeWidth={1}
            />
            <p className="text-lg font-medium">{previewFile.name}</p>
            <p className="text-sm text-muted-foreground">
              Preview not available for this file type
            </p>
            <Button variant="outline" onClick={handleDownload} className="gap-2">
              <Download className="w-4 h-4" /> Download to view
            </Button>
          </div>
        );
    }
  };

  return (
    <Dialog open={!!previewFile} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader className="flex flex-row items-center justify-between space-y-0 border-b pb-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileTypeIconByProps
              type={previewFile.type as "folder" | "file"}
              mimeType={previewFile.mimeType}
              name={previewFile.name}
              className="w-5 h-5"
            />
            <span className="truncate max-w-[400px]">{previewFile.name}</span>
          </DialogTitle>
          <div className="flex items-center gap-1">
            {previewFile.type === "file" && (
              <Button variant="ghost" size="icon" onClick={handleDownload}>
                <Download className="w-4 h-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={() => handleOpenChange(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-auto">
          {renderPreview()}
        </div>
      </DialogContent>
    </Dialog>
  );
}
