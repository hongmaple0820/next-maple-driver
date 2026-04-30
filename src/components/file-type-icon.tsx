"use client";

import {
  Folder,
  Image as ImageIcon,
  Film,
  Music,
  FileText,
  FileCode,
  Archive,
  Table2,
  File,
} from "lucide-react";
import type { FileItem } from "@/lib/file-utils";
import { getFileIcon, getFileIconColor } from "@/lib/file-utils";
import { cn } from "@/lib/utils";

// We use a static mapping approach to avoid creating components during render.
// The lint rule flags dynamic component creation like `const Icon = getX(); <Icon />`.

const iconMap: Record<string, typeof File> = {
  Folder,
  ImageIcon,
  Film,
  Music,
  FileText,
  FileCode,
  Archive,
  Table2,
  File,
};

function getIconName(item: FileItem): string {
  const IconComponent = getFileIcon(item);
  for (const [name, Comp] of Object.entries(iconMap)) {
    if (Comp === IconComponent) return name;
  }
  return "File";
}

export function FileTypeIcon({
  file,
  className,
  strokeWidth,
}: {
  file: FileItem;
  className?: string;
  strokeWidth?: number;
}) {
  const iconName = getIconName(file);
  const iconColor = getFileIconColor(file);
  const cls = cn(iconColor, className);

  switch (iconName) {
    case "Folder":
      return <Folder className={cls} strokeWidth={strokeWidth} />;
    case "ImageIcon":
      return <ImageIcon className={cls} strokeWidth={strokeWidth} />;
    case "Film":
      return <Film className={cls} strokeWidth={strokeWidth} />;
    case "Music":
      return <Music className={cls} strokeWidth={strokeWidth} />;
    case "FileText":
      return <FileText className={cls} strokeWidth={strokeWidth} />;
    case "FileCode":
      return <FileCode className={cls} strokeWidth={strokeWidth} />;
    case "Archive":
      return <Archive className={cls} strokeWidth={strokeWidth} />;
    case "Table2":
      return <Table2 className={cls} strokeWidth={strokeWidth} />;
    default:
      return <File className={cls} strokeWidth={strokeWidth} />;
  }
}

export function FileTypeIconByProps({
  type,
  mimeType,
  name,
  className,
  strokeWidth,
}: {
  type: "folder" | "file";
  mimeType?: string;
  name: string;
  className?: string;
  strokeWidth?: number;
}) {
  const file: FileItem = { id: "", name, type, mimeType, parentId: "", starred: false, trashed: false, createdAt: "", updatedAt: "" };
  return <FileTypeIcon file={file} className={className} strokeWidth={strokeWidth} />;
}
