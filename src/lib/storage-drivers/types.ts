export interface StorageDriverConfig {
  id: string;
  name: string;
  type: "local" | "webdav" | "s3" | "mount";
  config: Record<string, string>;
  isDefault: boolean;
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
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
