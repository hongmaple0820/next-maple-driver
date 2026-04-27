// Authentication type for cloud drivers
export type CloudAuthType = "oauth" | "password" | "sms" | "email" | "none";

// Authentication status for cloud drivers
export type CloudAuthStatus = "pending" | "authorized" | "expired" | "error";

// Rich file info returned by listDir and stat operations
export interface FileInfo {
  name: string;
  size: number;
  isDir: boolean;
  lastModified?: Date;
  created?: Date;
  mimeType?: string;
  // Optional fields that some drivers can provide
  id?: string;           // Provider-specific file ID (e.g., Baidu fs_id)
  parentPath?: string;   // Parent directory path
  extension?: string;    // File extension without dot
  thumbnailUrl?: string; // Thumbnail URL for images/videos
  downloadUrl?: string;  // Direct download URL (if available)
  md5?: string;          // File MD5 hash (if available)
}

export interface StorageDriverConfig {
  id: string;
  name: string;
  type: "local" | "webdav" | "s3" | "mount" | "ftp" | "baidu" | "aliyun" | "onedrive" | "google" | "115" | "quark";
  config: Record<string, string>;
  isDefault: boolean;
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  // Cloud driver auth fields
  authType?: CloudAuthType;
  authStatus?: CloudAuthStatus;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
  lastSyncAt?: Date;
}

// Extended StorageDriver interface with VFS support
export interface StorageDriver {
  readonly type: string;
  readonly config: StorageDriverConfig;

  // File operations (enhanced)
  writeFile(path: string, data: Buffer): Promise<void>;
  readFile(path: string): Promise<Buffer>;
  deleteFile(path: string): Promise<void>;
  fileExists(path: string): Promise<boolean>;
  getFileSize(path: string): Promise<number>;

  // Directory operations (enhanced)
  createDir(path: string): Promise<void>;
  deleteDir(path: string): Promise<void>;
  dirExists(path: string): Promise<boolean>;
  listDir(path: string): Promise<FileInfo[]>; // Changed from string[] to FileInfo[]

  // URL generation
  getPublicUrl?(path: string): Promise<string>;

  // Health check
  healthCheck(): Promise<{ healthy: boolean; message?: string }>;

  // Storage info
  getStorageInfo(): Promise<{ used: number; total: number; available: number }>;

  // NEW: Get file info/stat
  getFileInfo?(path: string): Promise<FileInfo | null>;
  
  // NEW: Stream support for large files
  createReadStream?(path: string, options?: { start?: number; end?: number }): Promise<ReadableStream<Uint8Array>>;
  createWriteStream?(path: string): Promise<WritableStream>;
  
  // NEW: Get download link (for proxy or redirect)
  getDownloadLink?(path: string): Promise<string>;
  
  // NEW: Copy within same driver
  copyWithin?(sourcePath: string, destPath: string): Promise<void>;
  
  // NEW: Move within same driver
  moveWithin?(sourcePath: string, destPath: string): Promise<void>;
}

// VFS Mount point configuration
export interface VFSMountPoint {
  id: string;               // Unique mount ID
  driverId: string;          // StorageDriverConfig ID
  mountPath: string;         // Virtual path where driver is mounted (e.g., "/baidu", "/aliyun/photos")
  driverType: string;        // Driver type (local, s3, webdav, baidu, etc.)
  driverSubPath?: string;    // Optional sub-path within the driver to start from
  isReadOnly: boolean;       // Whether this mount is read-only
  isEnabled: boolean;        // Whether this mount is active
  createdAt: Date;
  updatedAt: Date;
}

export interface StorageDriverFactory {
  type: string;
  displayName: string;
  description: string;
  configFields: StorageDriverConfigField[];
  create(config: StorageDriverConfig): StorageDriver;
  // Cloud driver extensions
  authType?: CloudAuthType;
  authUrl?: string; // OAuth authorization URL template
}

export interface StorageDriverConfigField {
  key: string;
  label: string;
  type: "text" | "password" | "number" | "url" | "path";
  required: boolean;
  placeholder?: string;
  defaultValue?: string;
  helpText?: string;
}

// OAuth configuration for cloud drivers
export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  redirectUri: string;
  // Optional extra params for specific providers
  extraAuthParams?: Record<string, string>;
  extraTokenParams?: Record<string, string>;
}

// OAuth token response
export interface OAuthTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

// Cloud driver info for display
export interface CloudDriverInfo {
  type: string;
  displayName: string;
  description: string;
  authType: CloudAuthType;
  icon: string; // lucide icon name
  color: string; // tailwind color class
  configFields: StorageDriverConfigField[];
}
