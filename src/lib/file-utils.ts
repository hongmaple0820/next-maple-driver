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
  childrenCount?: number;
  description?: string;
  colorLabel?: string;
}

// Color label definitions
export const COLOR_LABELS: Record<string, { bg: string; text: string; border: string; dot: string; label: string }> = {
  red: { bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400", border: "border-red-500/30", dot: "bg-red-500", label: "Red" },
  orange: { bg: "bg-orange-500/10", text: "text-orange-600 dark:text-orange-400", border: "border-orange-500/30", dot: "bg-orange-500", label: "Orange" },
  yellow: { bg: "bg-yellow-500/10", text: "text-yellow-600 dark:text-yellow-400", border: "border-yellow-500/30", dot: "bg-yellow-500", label: "Yellow" },
  green: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-500/30", dot: "bg-emerald-500", label: "Green" },
  blue: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", border: "border-blue-500/30", dot: "bg-blue-500", label: "Blue" },
  purple: { bg: "bg-purple-500/10", text: "text-purple-600 dark:text-purple-400", border: "border-purple-500/30", dot: "bg-purple-500", label: "Purple" },
  pink: { bg: "bg-pink-500/10", text: "text-pink-600 dark:text-pink-400", border: "border-pink-500/30", dot: "bg-pink-500", label: "Pink" },
  gray: { bg: "bg-gray-500/10", text: "text-gray-600 dark:text-gray-400", border: "border-gray-500/30", dot: "bg-gray-500", label: "Gray" },
};

// Get color label style helper
export function getColorLabelStyle(colorLabel?: string) {
  if (!colorLabel || !COLOR_LABELS[colorLabel]) return null;
  return COLOR_LABELS[colorLabel];
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
  starredCount: number;
  trashedCount: number;
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

// Format date to compact relative or short format (for compact display contexts)
export function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "—";
  return formatRelativeTime(dateStr);
}

// Format date to a compact relative time string
// Returns: "just now", "5 min ago", "2 hr ago", "3 days ago", "Jan 15"
export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();

  // Future dates
  if (diffMs < 0) {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffSeconds < 10) return "just now";
  if (diffSeconds < 60) return `${diffSeconds} sec ago`;
  if (diffMinutes === 1) return "1 min ago";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  if (diffHours === 1) return "1 hr ago";
  if (diffHours < 24) return `${diffHours} hr ago`;
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffWeeks === 1) return "1 wk ago";
  if (diffWeeks < 4) return `${diffWeeks} wks ago`;
  if (diffMonths === 1) return "1 mo ago";
  if (diffMonths < 12) return `${diffMonths} mo ago`;

  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

// Get file extension from name
export function getFileExtension(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

// Get filename without extension
export function getFileNameWithoutExtension(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? parts.slice(0, -1).join(".") : name;
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

// Check if a file is an archive that can be extracted
export function isArchiveFile(item: FileItem): boolean {
  if (item.type === "folder") return false;

  const mime = item.mimeType?.toLowerCase() || "";
  const ext = getFileExtension(item.name);

  // Only support .zip for now (adm-zip supported formats)
  if (
    mime.includes("zip") ||
    ext === "zip"
  ) {
    return true;
  }

  // Show extract option for other archive types too (but they'll show a not-supported message)
  if (
    mime.includes("rar") ||
    mime.includes("tar") ||
    mime.includes("gzip") ||
    mime.includes("7z") ||
    ["rar", "tar", "gz", "bz2", "7z", "xz", "tgz"].includes(ext)
  ) {
    return true;
  }

  return false;
}

// Check if a file is a zip file (actually extractable)
export function isZipFile(item: FileItem): boolean {
  if (item.type === "folder") return false;

  const mime = item.mimeType?.toLowerCase() || "";
  const ext = getFileExtension(item.name);

  return mime.includes("zip") || ext === "zip";
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
