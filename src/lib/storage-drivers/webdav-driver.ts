import { createClient, WebDAVClient } from "webdav";
import type { StorageDriver, StorageDriverConfig, StorageDriverFactory, StorageDriverConfigField } from "./types";

interface WebDAVDriverConfig {
  url: string;
  username: string;
  password: string;
  pathPrefix?: string;
}

export class WebDAVStorageDriver implements StorageDriver {
  readonly type = "webdav";
  readonly config: StorageDriverConfig;
  private client: WebDAVClient;
  private pathPrefix: string;

  constructor(config: StorageDriverConfig) {
    this.config = config;
    const davConfig = config.config as unknown as WebDAVDriverConfig;
    this.pathPrefix = (davConfig.pathPrefix || "").replace(/^\/+|\/+$/g, "");

    this.client = createClient(davConfig.url, {
      username: davConfig.username || undefined,
      password: davConfig.password || undefined,
    });
  }

  private getPath(path: string): string {
    const cleanPath = path.replace(/^\/+/, "");
    const fullPath = this.pathPrefix ? `/${this.pathPrefix}/${cleanPath}` : `/${cleanPath}`;
    return fullPath;
  }

  async writeFile(path: string, data: Buffer): Promise<void> {
    const fullPath = this.getPath(path);
    // Ensure parent directory exists
    const parentPath = fullPath.substring(0, fullPath.lastIndexOf("/"));
    try {
      await this.client.createDirectory(parentPath, { recursive: true });
    } catch {
      // Directory might already exist
    }
    await this.client.putFileContents(fullPath, data);
  }

  async readFile(path: string): Promise<Buffer> {
    const fullPath = this.getPath(path);
    const data = await this.client.getFileContents(fullPath);
    if (data instanceof ArrayBuffer) {
      return Buffer.from(data);
    }
    return Buffer.from(data as Uint8Array);
  }

  async deleteFile(path: string): Promise<void> {
    const fullPath = this.getPath(path);
    try {
      await this.client.deleteFile(fullPath);
    } catch {
      // File might already be deleted
    }
  }

  async fileExists(path: string): Promise<boolean> {
    try {
      const fullPath = this.getPath(path);
      return await this.client.exists(fullPath);
    } catch {
      return false;
    }
  }

  async getFileSize(path: string): Promise<number> {
    const fullPath = this.getPath(path);
    const stat = await this.client.stat(fullPath);
    const statData = stat as { size?: number };
    return statData.size ?? 0;
  }

  async createDir(path: string): Promise<void> {
    const fullPath = this.getPath(path);
    try {
      await this.client.createDirectory(fullPath, { recursive: true });
    } catch {
      // Directory might already exist
    }
  }

  async deleteDir(path: string): Promise<void> {
    const fullPath = this.getPath(path);
    try {
      await this.client.deleteFile(fullPath);
    } catch {
      // Directory might already be deleted
    }
  }

  async dirExists(path: string): Promise<boolean> {
    try {
      const fullPath = this.getPath(path);
      return await this.client.exists(fullPath);
    } catch {
      return false;
    }
  }

  async listDir(path: string): Promise<string[]> {
    const fullPath = this.getPath(path);
    try {
      const items = await this.client.getDirectoryContents(fullPath);
      if (Array.isArray(items)) {
        return items.map((item: { basename: string; type: string }) =>
          item.type === "directory" ? item.basename + "/" : item.basename
        );
      }
      return [];
    } catch {
      return [];
    }
  }

  async getPublicUrl(path: string): Promise<string> {
    // WebDAV doesn't typically support public URLs
    // Return the file path for reference
    const fullPath = this.getPath(path);
    const config = this.config.config as unknown as WebDAVDriverConfig;
    return `${config.url}${fullPath}`;
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    try {
      const config = this.config.config as unknown as WebDAVDriverConfig;
      const rootPath = this.pathPrefix ? `/${this.pathPrefix}` : "/";
      await this.client.getDirectoryContents(rootPath);
      return { healthy: true, message: "WebDAV server is accessible" };
    } catch (e) {
      return { healthy: false, message: `WebDAV error: ${(e as Error).message}` };
    }
  }

  async getStorageInfo(): Promise<{ used: number; total: number; available: number }> {
    // WebDAV doesn't typically expose storage info via standard methods
    return { used: 0, total: 0, available: 0 };
  }
}

export const webdavDriverFactory: StorageDriverFactory = {
  type: "webdav",
  displayName: "WebDAV",
  description: "Connect to WebDAV servers like Nextcloud, ownCloud, or any WebDAV-compatible service",
  configFields: [
    {
      key: "url",
      label: "Server URL",
      type: "url",
      required: true,
      placeholder: "https://nextcloud.example.com/remote.php/dav/files/user/",
      helpText: "Full WebDAV endpoint URL",
    },
    {
      key: "username",
      label: "Username",
      type: "text",
      required: true,
      placeholder: "user@example.com",
    },
    {
      key: "password",
      label: "Password / App Password",
      type: "password",
      required: true,
      placeholder: "••••••••",
      helpText: "Use an app-specific password if 2FA is enabled",
    },
    {
      key: "pathPrefix",
      label: "Path Prefix",
      type: "text",
      required: false,
      placeholder: "clouddrive",
      helpText: "Optional subdirectory within the WebDAV root",
    },
  ],
  create: (config) => new WebDAVStorageDriver(config),
};
