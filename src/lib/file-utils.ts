import {
  Folder,
  FolderOpen,
  Image,
  Film,
  Music,
  FileText,
  FileCode,
  Archive,
  Table2,
  File,
  type LucideIcon,
} from "lucide-react";

export interface FileItem {
  id: string;
  name: string;
  type: "folder" | "file";
  mimeType?: string;
  size?: number;
  parentId: string;
  starred: boolean;
  trashed: boolean;
  createdAt: string;
  updatedAt: string;
  url?: string;
}

export interface BreadcrumbItem {
  id: string;
  name: string;
}

export interface StorageStats {
  totalFiles: number;
  totalFolders: number;
  usedBytes: number;
  totalBytes: number;
  byType: Record<string, number>;
}

export interface ShareInfo {
  id: string;
  token: string;
  fileId: string;
  password?: string;
  expiresAt?: string;
  downloadCount: number;
  createdAt: string;
}

// Format file size to human-readable string
export function formatFileSize(bytes?: number | null): string {
  if (bytes == null || bytes === 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

// Format date to relative or short format
export function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

// Get file extension from name
export function getFileExtension(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

// Map MIME type / extension to lucide icon
export function getFileIcon(item: FileItem): LucideIcon {
  if (item.type === "folder") return Folder;

  const mime = item.mimeType?.toLowerCase() || "";
  const ext = getFileExtension(item.name);

  // Image
  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"].includes(ext)) {
    return Image;
  }

  // Video
  if (mime.startsWith("video/") || ["mp4", "webm", "avi", "mov", "mkv", "flv"].includes(ext)) {
    return Film;
  }

  // Audio
  if (mime.startsWith("audio/") || ["mp3", "wav", "ogg", "flac", "aac", "m4a"].includes(ext)) {
    return Music;
  }

  // PDF
  if (mime === "application/pdf" || ext === "pdf") {
    return FileText;
  }

  // Spreadsheets
  if (
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    ["xls", "xlsx", "csv", "ods"].includes(ext)
  ) {
    return Table2;
  }

  // Code
  if (
    mime.includes("json") ||
    mime.includes("javascript") ||
    mime.includes("typescript") ||
    mime.includes("xml") ||
    mime.includes("html") ||
    mime.includes("css") ||
    [
      "js", "ts", "tsx", "jsx", "py", "rb", "go", "rs", "java", "c", "cpp",
      "h", "cs", "php", "swift", "kt", "sh", "bash", "zsh", "yaml", "yml",
      "toml", "json", "xml", "html", "css", "scss", "less", "sql", "md",
      "vue", "svelte",
    ].includes(ext)
  ) {
    return FileCode;
  }

  // Archives
  if (
    mime.includes("zip") ||
    mime.includes("rar") ||
    mime.includes("tar") ||
    mime.includes("gzip") ||
    mime.includes("7z") ||
    ["zip", "rar", "tar", "gz", "bz2", "7z", "xz", "tgz"].includes(ext)
  ) {
    return Archive;
  }

  // Documents
  if (
    mime.includes("document") ||
    mime.includes("word") ||
    mime.includes("text/plain") ||
    ["doc", "docx", "txt", "rtf", "odt"].includes(ext)
  ) {
    return FileText;
  }

  return File;
}

// Get icon color class based on file type
export function getFileIconColor(item: FileItem): string {
  if (item.type === "folder") return "text-amber-500";

  const mime = item.mimeType?.toLowerCase() || "";
  const ext = getFileExtension(item.name);

  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) return "text-emerald-500";
  if (mime.startsWith("video/") || ["mp4", "webm", "avi", "mov"].includes(ext)) return "text-rose-500";
  if (mime.startsWith("audio/") || ["mp3", "wav", "ogg", "flac"].includes(ext)) return "text-purple-500";
  if (mime === "application/pdf" || ext === "pdf") return "text-red-500";
  if (mime.includes("spreadsheet") || ["xls", "xlsx", "csv"].includes(ext)) return "text-emerald-600";
  if (
    ["js", "ts", "tsx", "jsx", "py", "rb", "go", "rs", "java", "c", "cpp", "html", "css", "json", "md"].includes(ext)
  ) return "text-sky-500";
  if (["zip", "rar", "tar", "gz", "7z"].includes(ext)) return "text-orange-500";
  if (mime.includes("document") || ["doc", "docx", "txt", "rtf"].includes(ext)) return "text-blue-500";

  return "text-muted-foreground";
}

// Get file type label
export function getFileTypeLabel(item: FileItem): string {
  if (item.type === "folder") return "Folder";

  const mime = item.mimeType?.toLowerCase() || "";
  const ext = getFileExtension(item.name);

  if (mime.startsWith("image/")) return "Image";
  if (mime.startsWith("video/")) return "Video";
  if (mime.startsWith("audio/")) return "Audio";
  if (mime === "application/pdf") return "PDF";
  if (mime.includes("spreadsheet") || ["xls", "xlsx", "csv"].includes(ext)) return "Spreadsheet";
  if (["js", "ts", "tsx", "jsx", "py", "rb", "go", "rs", "java"].includes(ext)) return "Code";
  if (["zip", "rar", "tar", "gz", "7z"].includes(ext)) return "Archive";
  if (mime.includes("document") || ["doc", "docx", "txt"].includes(ext)) return "Document";

  return ext ? ext.toUpperCase() : "File";
}

// Check if a file matches a given type filter
export function matchesTypeFilter(file: FileItem, filter: string): boolean {
  if (file.type === "folder") return true;

  const mime = file.mimeType?.toLowerCase() || "";
  const ext = getFileExtension(file.name);

  switch (filter) {
    case "images":
      return mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"].includes(ext);
    case "videos":
      return mime.startsWith("video/") || ["mp4", "webm", "avi", "mov", "mkv", "flv"].includes(ext);
    case "audio":
      return mime.startsWith("audio/") || ["mp3", "wav", "ogg", "flac", "aac", "m4a"].includes(ext);
    case "documents":
      return mime.includes("document") || mime.includes("word") || mime.includes("pdf") || mime.includes("text/plain") ||
        mime.includes("spreadsheet") || mime.includes("excel") ||
        ["doc", "docx", "pdf", "txt", "rtf", "xls", "xlsx", "csv", "odt", "ods"].includes(ext);
    case "code":
      return mime.includes("json") || mime.includes("javascript") || mime.includes("typescript") ||
        mime.includes("xml") || mime.includes("html") || mime.includes("css") ||
        ["js", "ts", "tsx", "jsx", "py", "rb", "go", "rs", "java", "c", "cpp", "h", "cs", "php",
          "swift", "kt", "sh", "bash", "yaml", "yml", "toml", "json", "xml", "html", "css",
          "scss", "less", "sql", "md", "vue", "svelte"].includes(ext);
    case "archives":
      return mime.includes("zip") || mime.includes("rar") || mime.includes("tar") || mime.includes("gzip") || mime.includes("7z") ||
        ["zip", "rar", "tar", "gz", "bz2", "7z", "xz", "tgz"].includes(ext);
    default:
      return true;
  }
}

// Check if file is previewable
export function isPreviewable(item: FileItem): boolean {
  if (item.type === "folder") return false;

  const mime = item.mimeType?.toLowerCase() || "";
  const ext = getFileExtension(item.name);

  const imageExts = ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"];
  const textExts = [
    "txt", "json", "js", "ts", "tsx", "jsx", "py", "rb", "go", "rs", "java",
    "c", "cpp", "h", "cs", "php", "swift", "kt", "sh", "bash", "yaml", "yml",
    "toml", "xml", "html", "css", "scss", "less", "sql", "md", "csv", "log",
    "env", "gitignore", "vue", "svelte", "ini", "cfg", "conf",
  ];
  const videoExts = ["mp4", "webm"];
  const audioExts = ["mp3", "wav", "ogg"];

  if (mime.startsWith("image/") || imageExts.includes(ext)) return true;
  if (mime.startsWith("text/") || textExts.includes(ext)) return true;
  if (mime.startsWith("video/") || videoExts.includes(ext)) return true;
  if (mime.startsWith("audio/") || audioExts.includes(ext)) return true;
  if (mime === "application/pdf" || ext === "pdf") return true;

  return false;
}

// Get preview type
export type PreviewType = "image" | "text" | "video" | "audio" | "pdf" | "none";

export function getPreviewType(item: FileItem): PreviewType {
  if (item.type === "folder") return "none";

  const mime = item.mimeType?.toLowerCase() || "";
  const ext = getFileExtension(item.name);

  const imageExts = ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"];
  const textExts = [
    "txt", "json", "js", "ts", "tsx", "jsx", "py", "rb", "go", "rs", "java",
    "c", "cpp", "h", "cs", "php", "swift", "kt", "sh", "bash", "yaml", "yml",
    "toml", "xml", "html", "css", "scss", "less", "sql", "md", "csv", "log",
    "env", "gitignore", "vue", "svelte", "ini", "cfg", "conf",
  ];
  const videoExts = ["mp4", "webm"];
  const audioExts = ["mp3", "wav", "ogg"];

  if (mime.startsWith("image/") || imageExts.includes(ext)) return "image";
  if (mime.startsWith("text/") || textExts.includes(ext)) return "text";
  if (mime.startsWith("video/") || videoExts.includes(ext)) return "video";
  if (mime.startsWith("audio/") || audioExts.includes(ext)) return "audio";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";

  return "none";
}
