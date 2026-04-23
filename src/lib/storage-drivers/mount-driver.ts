import { writeFile as fsWriteFile, readFile as fsReadFile, unlink, access, stat, mkdir, rmdir, readdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import type { StorageDriver, StorageDriverConfig, StorageDriverFactory, StorageDriverConfigField } from "./types";
import { WebDAVStorageDriver } from "./webdav-driver";

const execAsync = promisify(exec);

type MountProtocol = "webdav" | "nfs" | "smb";

interface MountDriverConfig {
  protocol: MountProtocol;
  // WebDAV
  url?: string;
  username?: string;
  password?: string;
  // NFS
  host?: string;
  exportPath?: string;
  // SMB/CIFS
  share?: string;
  domain?: string;
  // Common
  mountPoint: string;
  pathPrefix?: string;
  mountOptions?: string;
}

/**
 * MountStorageDriver handles remote storage access via different protocols.
 *
 * For WebDAV protocol: Delegates all file operations to the WebDAVStorageDriver,
 * which uses native HTTP fetch for PROPFIND/GET/PUT/DELETE/MKCOL operations.
 *
 * For NFS/SMB protocols: Attempts to mount the remote filesystem to a local path
 * using system mount commands, then operates on the local filesystem. Falls back
 * to a local-only directory if the mount command fails (e.g., insufficient permissions).
 */
export class MountStorageDriver implements StorageDriver {
  readonly type = "mount";
  readonly config: StorageDriverConfig;
  private mountPoint: string;
  private pathPrefix: string;
  private mountConfig: MountDriverConfig;
  private mounted: boolean = false;

  // WebDAV delegate - used when protocol is "webdav"
  private webdavDelegate: WebDAVStorageDriver | null = null;

  constructor(config: StorageDriverConfig) {
    this.config = config;
    this.mountConfig = config.config as unknown as MountDriverConfig;
    this.mountPoint = this.mountConfig.mountPoint || join(process.cwd(), "mnt", config.id);
    this.pathPrefix = (this.mountConfig.pathPrefix || "").replace(/^\/+|\/+$/g, "");

    // If protocol is WebDAV, create a WebDAV delegate for all file operations
    if (this.mountConfig.protocol === "webdav") {
      this.webdavDelegate = new WebDAVStorageDriver({
        ...config,
        config: {
          url: this.mountConfig.url || "",
          username: this.mountConfig.username || "",
          password: this.mountConfig.password || "",
          pathPrefix: this.mountConfig.pathPrefix || "",
        },
      } as StorageDriverConfig);
    }
  }

  /** Check if we should use the WebDAV delegate for file operations */
  private get useWebDAV(): boolean {
    return this.mountConfig.protocol === "webdav" && this.webdavDelegate !== null;
  }

  private resolvePath(path: string): string {
    const cleanPath = path.replace(/^\/+/, "");
    const fullPath = this.pathPrefix ? join(this.mountPoint, this.pathPrefix, cleanPath) : join(this.mountPoint, cleanPath);
    return fullPath;
  }

  // Attempt to mount the remote storage
  async mount(): Promise<{ success: boolean; message: string }> {
    if (this.mounted) return { success: true, message: "Already mounted" };

    const cfg = this.mountConfig;

    try {
      switch (cfg.protocol) {
        case "webdav": {
          // For WebDAV, we don't need a filesystem mount.
          // The WebDAVStorageDriver handles all operations via HTTP.
          // We still create a local mount point directory as a cache/staging area.
          if (!cfg.url) return { success: false, message: "WebDAV URL is required" };

          // Verify WebDAV connectivity
          if (this.webdavDelegate) {
            const health = await this.webdavDelegate.healthCheck();
            if (!health.healthy) {
              return { success: false, message: `WebDAV connection failed: ${health.message}` };
            }
          }

          // Create local staging directory
          if (!existsSync(this.mountPoint)) {
            await mkdir(this.mountPoint, { recursive: true });
          }

          // Write mount info marker
          await fsWriteFile(join(this.mountPoint, ".mount-info"), JSON.stringify({
            protocol: "webdav",
            url: cfg.url,
            username: cfg.username || "",
            mountedAt: new Date().toISOString(),
            mode: "delegate",
          }));

          this.mounted = true;
          return { success: true, message: `WebDAV connected to ${cfg.url}` };
        }

        case "nfs": {
          if (!cfg.host || !cfg.exportPath) {
            return { success: false, message: "NFS host and export path are required" };
          }

          // Ensure mount point exists
          if (!existsSync(this.mountPoint)) {
            await mkdir(this.mountPoint, { recursive: true });
          }

          const nfsPath = `${cfg.host}:${cfg.exportPath}`;
          const opts = cfg.mountOptions || "rw,soft,intr";
          try {
            await execAsync(`mount -t nfs -o ${opts} ${nfsPath} ${this.mountPoint}`);
            this.mounted = true;
            return { success: true, message: `NFS mounted: ${nfsPath} -> ${this.mountPoint}` };
          } catch (e) {
            // If mount command fails, fall back to local directory mode
            await fsWriteFile(join(this.mountPoint, ".mount-info"), JSON.stringify({
              protocol: "nfs",
              host: cfg.host,
              exportPath: cfg.exportPath,
              status: "local-fallback",
              mountedAt: new Date().toISOString(),
              error: (e as Error).message,
            }));
            this.mounted = true;
            return { success: true, message: `NFS mount failed, using local directory at ${this.mountPoint}. Mount error: ${(e as Error).message}` };
          }
        }

        case "smb": {
          if (!cfg.host || !cfg.share) {
            return { success: false, message: "SMB host and share name are required" };
          }

          // Ensure mount point exists
          if (!existsSync(this.mountPoint)) {
            await mkdir(this.mountPoint, { recursive: true });
          }

          const smbPath = `//${cfg.host}/${cfg.share}`;
          const opts = cfg.mountOptions || `username=${cfg.username || "guest"},password=${cfg.password || ""},domain=${cfg.domain || "WORKGROUP"}`;
          try {
            await execAsync(`mount -t cifs -o ${opts} ${smbPath} ${this.mountPoint}`);
            this.mounted = true;
            return { success: true, message: `SMB mounted: ${smbPath} -> ${this.mountPoint}` };
          } catch (e) {
            // Fall back to local directory mode
            await fsWriteFile(join(this.mountPoint, ".mount-info"), JSON.stringify({
              protocol: "smb",
              host: cfg.host,
              share: cfg.share,
              domain: cfg.domain || "",
              status: "local-fallback",
              mountedAt: new Date().toISOString(),
              error: (e as Error).message,
            }));
            this.mounted = true;
            return { success: true, message: `SMB mount failed, using local directory at ${this.mountPoint}. Mount error: ${(e as Error).message}` };
          }
        }

        default:
          return { success: false, message: `Unknown protocol: ${cfg.protocol}` };
      }
    } catch (e) {
      return { success: false, message: `Mount failed: ${(e as Error).message}` };
    }
  }

  // Unmount the remote storage
  async unmount(): Promise<{ success: boolean; message: string }> {
    if (!this.mounted) return { success: true, message: "Not mounted" };

    const cfg = this.mountConfig;
    try {
      if (cfg.protocol === "nfs" || cfg.protocol === "smb") {
        try {
          await execAsync(`umount ${this.mountPoint}`);
        } catch {
          // Ignore unmount errors
        }
      }
      // WebDAV doesn't need unmounting - just mark as unmounted
      this.mounted = false;
      return { success: true, message: "Unmounted successfully" };
    } catch (e) {
      return { success: false, message: `Unmount failed: ${(e as Error).message}` };
    }
  }

  async writeFile(path: string, data: Buffer): Promise<void> {
    if (this.useWebDAV && this.webdavDelegate) {
      return this.webdavDelegate.writeFile(path, data);
    }

    await this.mount();
    const fullPath = this.resolvePath(path);
    const dir = join(fullPath, "..");
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    await fsWriteFile(fullPath, data);
  }

  async readFile(path: string): Promise<Buffer> {
    if (this.useWebDAV && this.webdavDelegate) {
      return this.webdavDelegate.readFile(path);
    }

    await this.mount();
    return fsReadFile(this.resolvePath(path));
  }

  async deleteFile(path: string): Promise<void> {
    if (this.useWebDAV && this.webdavDelegate) {
      return this.webdavDelegate.deleteFile(path);
    }

    await this.mount();
    try {
      await unlink(this.resolvePath(path));
    } catch {
      // File might already be deleted
    }
  }

  async fileExists(path: string): Promise<boolean> {
    if (this.useWebDAV && this.webdavDelegate) {
      return this.webdavDelegate.fileExists(path);
    }

    await this.mount();
    try {
      await access(this.resolvePath(path));
      return true;
    } catch {
      return false;
    }
  }

  async getFileSize(path: string): Promise<number> {
    if (this.useWebDAV && this.webdavDelegate) {
      return this.webdavDelegate.getFileSize(path);
    }

    await this.mount();
    const s = await stat(this.resolvePath(path));
    return s.size;
  }

  async createDir(path: string): Promise<void> {
    if (this.useWebDAV && this.webdavDelegate) {
      return this.webdavDelegate.createDir(path);
    }

    await this.mount();
    await mkdir(this.resolvePath(path), { recursive: true });
  }

  async deleteDir(path: string): Promise<void> {
    if (this.useWebDAV && this.webdavDelegate) {
      return this.webdavDelegate.deleteDir(path);
    }

    await this.mount();
    try {
      await rmdir(this.resolvePath(path), { recursive: true });
    } catch {
      // Dir might already be deleted
    }
  }

  async dirExists(path: string): Promise<boolean> {
    if (this.useWebDAV && this.webdavDelegate) {
      return this.webdavDelegate.dirExists(path);
    }

    await this.mount();
    return existsSync(this.resolvePath(path));
  }

  async listDir(path: string): Promise<string[]> {
    if (this.useWebDAV && this.webdavDelegate) {
      return this.webdavDelegate.listDir(path);
    }

    await this.mount();
    try {
      const entries = await readdir(this.resolvePath(path));
      // Add "/" suffix for directories to match convention
      const results: string[] = [];
      for (const entry of entries) {
        const fullPath = join(this.resolvePath(path), entry);
        try {
          const s = await stat(fullPath);
          results.push(s.isDirectory() ? entry + "/" : entry);
        } catch {
          results.push(entry);
        }
      }
      return results;
    } catch {
      return [];
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    // For WebDAV protocol, delegate health check to WebDAV driver
    if (this.useWebDAV && this.webdavDelegate) {
      const result = await this.webdavDelegate.healthCheck();
      return {
        healthy: result.healthy,
        message: result.healthy
          ? `WebDAV mount healthy: ${result.message}`
          : `WebDAV mount unhealthy: ${result.message}`,
      };
    }

    // For NFS/SMB, check the local mount point
    try {
      const mountResult = await this.mount();
      if (!mountResult.success) {
        return { healthy: false, message: mountResult.message };
      }

      // Check if mount point is accessible
      if (!existsSync(this.mountPoint)) {
        return { healthy: false, message: `Mount point ${this.mountPoint} does not exist` };
      }

      // Try to read the mount info file if it exists
      const mountInfoPath = join(this.mountPoint, ".mount-info");
      if (existsSync(mountInfoPath)) {
        try {
          const info = JSON.parse(await fsReadFile(mountInfoPath, "utf-8"));
          if (info.status === "local-fallback") {
            return {
              healthy: true,
              message: `Mount point accessible (local fallback mode - ${this.mountConfig.protocol} mount failed)`,
            };
          }
        } catch {
          // Ignore parse errors
        }
        return { healthy: true, message: `Mount point accessible (${this.mountConfig.protocol} protocol)` };
      }

      // Try listing the directory
      try {
        await readdir(this.mountPoint);
        return { healthy: true, message: `Mount point accessible (${this.mountConfig.protocol} protocol)` };
      } catch {
        return { healthy: false, message: "Mount point exists but is not readable" };
      }
    } catch (e) {
      return { healthy: false, message: `Health check failed: ${(e as Error).message}` };
    }
  }

  async getStorageInfo(): Promise<{ used: number; total: number; available: number }> {
    // For WebDAV protocol, delegate to WebDAV driver
    if (this.useWebDAV && this.webdavDelegate) {
      return this.webdavDelegate.getStorageInfo();
    }

    // For NFS/SMB, use filesystem stats
    try {
      await this.mount();
      const { statfs } = await import("fs");
      return new Promise((resolve) => {
        statfs(this.mountPoint, (err, stats) => {
          if (err) {
            resolve({ used: 0, total: 10737418240, available: 10737418240 });
            return;
          }
          const total = Number(stats.blocks) * Number(stats.bsize);
          const available = Number(stats.bfree) * Number(stats.bsize);
          resolve({ used: total - available, total, available });
        });
      });
    } catch {
      return { used: 0, total: 10737418240, available: 10737418240 };
    }
  }
}

export const mountDriverFactory: StorageDriverFactory = {
  type: "mount",
  displayName: "Network Mount",
  description: "Mount remote storage via WebDAV, NFS, or SMB/CIFS protocol",
  configFields: [
    {
      key: "protocol",
      label: "Mount Protocol",
      type: "text",
      required: true,
      placeholder: "webdav",
      defaultValue: "webdav",
      helpText: "Protocol type: webdav, nfs, or smb",
    },
    {
      key: "mountPoint",
      label: "Local Mount Point",
      type: "path",
      required: true,
      placeholder: "/mnt/clouddrive",
      helpText: "Local directory path where the remote storage will be mounted (used by NFS/SMB)",
    },
    {
      key: "url",
      label: "Server URL (WebDAV)",
      type: "url",
      required: false,
      placeholder: "https://nextcloud.example.com/remote.php/dav/files/user/",
      helpText: "WebDAV server URL (required for WebDAV protocol)",
    },
    {
      key: "host",
      label: "Server Host (NFS/SMB)",
      type: "text",
      required: false,
      placeholder: "192.168.1.100",
      helpText: "Remote server hostname or IP (required for NFS/SMB)",
    },
    {
      key: "exportPath",
      label: "Export Path (NFS)",
      type: "text",
      required: false,
      placeholder: "/export/data",
      helpText: "NFS export path on the remote server",
    },
    {
      key: "share",
      label: "Share Name (SMB)",
      type: "text",
      required: false,
      placeholder: "shared",
      helpText: "SMB/CIFS share name",
    },
    {
      key: "username",
      label: "Username",
      type: "text",
      required: false,
      placeholder: "user",
      helpText: "Authentication username",
    },
    {
      key: "password",
      label: "Password",
      type: "password",
      required: false,
      placeholder: "••••••••",
      helpText: "Authentication password",
    },
    {
      key: "domain",
      label: "Domain (SMB)",
      type: "text",
      required: false,
      placeholder: "WORKGROUP",
      helpText: "Windows domain for SMB authentication",
    },
    {
      key: "pathPrefix",
      label: "Path Prefix",
      type: "text",
      required: false,
      placeholder: "clouddrive",
      helpText: "Optional subdirectory within the mounted storage",
    },
    {
      key: "mountOptions",
      label: "Mount Options",
      type: "text",
      required: false,
      placeholder: "rw,soft,intr",
      helpText: "Additional mount options for NFS/SMB (comma-separated)",
    },
  ],
  create: (config) => new MountStorageDriver(config),
};
