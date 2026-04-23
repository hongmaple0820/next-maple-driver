// Authentication type for cloud drivers
export type CloudAuthType = "oauth" | "password" | "sms" | "email" | "none";

// Authentication status for cloud drivers
export type CloudAuthStatus = "pending" | "authorized" | "expired" | "error";

export interface StorageDriverConfig {
  id: string;
  name: string;
  type: "local" | "webdav" | "s3" | "mount" | "baidu" | "aliyun" | "onedrive" | "google" | "115" | "quark";
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

export interface StorageDriver {
  readonly type: string;
  readonly config: StorageDriverConfig;

  // File operations
  writeFile(path: string, data: Buffer): Promise<void>;
  readFile(path: string): Promise<Buffer>;
  deleteFile(path: string): Promise<void>;
  fileExists(path: string): Promise<boolean>;
  getFileSize(path: string): Promise<number>;

  // Directory operations
  createDir(path: string): Promise<void>;
  deleteDir(path: string): Promise<void>;
  dirExists(path: string): Promise<boolean>;
  listDir(path: string): Promise<string[]>;

  // URL generation (for direct access if supported)
  getPublicUrl?(path: string): Promise<string>;

  // Health check
  healthCheck(): Promise<{ healthy: boolean; message?: string }>;

  // Storage info
  getStorageInfo(): Promise<{ used: number; total: number; available: number }>;
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
