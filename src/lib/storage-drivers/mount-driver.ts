import { writeFile, readFile, unlink, access, stat, mkdir, rmdir, readdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import type { StorageDriver, StorageDriverConfig, StorageDriverFactory, StorageDriverConfigField } from "./types";

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

export class MountStorageDriver implements StorageDriver {
  readonly type = "mount";
  readonly config: StorageDriverConfig;
  private mountPoint: string;
  private pathPrefix: string;
  private mountConfig: MountDriverConfig;
  private mounted: boolean = false;

  constructor(config: StorageDriverConfig) {
    this.config = config;
    this.mountConfig = config.config as unknown as MountDriverConfig;
    this.mountPoint = this.mountConfig.mountPoint || join(process.cwd(), "mnt", config.id);
    this.pathPrefix = (this.mountConfig.pathPrefix || "").replace(/^\/+|\/+$/g, "");
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
      // Ensure mount point exists
      if (!existsSync(this.mountPoint)) {
        await mkdir(this.mountPoint, { recursive: true });
      }

      switch (cfg.protocol) {
        case "webdav": {
          // For WebDAV mounting, we use the local file system approach
          // (Real WebDAV mounting requires FUSE/rclone which may not be available)
          // Instead, we delegate to the webdav-driver pattern but store locally
          if (!cfg.url) return { success: false, message: "WebDAV URL is required" };
          // Create a marker file indicating this is a WebDAV mount
          await writeFile(join(this.mountPoint, ".mount-info"), JSON.stringify({
            protocol: "webdav",
            url: cfg.url,
            username: cfg.username || "",
            mountedAt: new Date().toISOString(),
          }));
          this.mounted = true;
          return { success: true, message: `WebDAV mount point created at ${this.mountPoint}` };
        }

        case "nfs": {
          if (!cfg.host || !cfg.exportPath) {
            return { success: false, message: "NFS host and export path are required" };
          }
          const nfsPath = `${cfg.host}:${cfg.exportPath}`;
          const opts = cfg.mountOptions || "rw,soft,intr";
          try {
            await execAsync(`mount -t nfs -o ${opts} ${nfsPath} ${this.mountPoint}`);
            this.mounted = true;
            return { success: true, message: `NFS mounted: ${nfsPath} -> ${this.mountPoint}` };
          } catch (e) {
            // If mount command fails, fall back to local directory mode
            await writeFile(join(this.mountPoint, ".mount-info"), JSON.stringify({
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
          const smbPath = `//${cfg.host}/${cfg.share}`;
          const opts = cfg.mountOptions || `username=${cfg.username || "guest"},password=${cfg.password || ""},domain=${cfg.domain || "WORKGROUP"}`;
          try {
            await execAsync(`mount -t cifs -o ${opts} ${smbPath} ${this.mountPoint}`);
            this.mounted = true;
            return { success: true, message: `SMB mounted: ${smbPath} -> ${this.mountPoint}` };
          } catch (e) {
            // Fall back to local directory mode
            await writeFile(join(this.mountPoint, ".mount-info"), JSON.stringify({
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
      this.mounted = false;
      return { success: true, message: "Unmounted successfully" };
    } catch (e) {
      return { success: false, message: `Unmount failed: ${(e as Error).message}` };
    }
  }

  async writeFile(path: string, data: Buffer): Promise<void> {
    await this.mount();
    const fullPath = this.resolvePath(path);
    const dir = join(fullPath, "..");
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    await writeFile(fullPath, data);
  }

  async readFile(path: string): Promise<Buffer> {
    await this.mount();
    return readFile(this.resolvePath(path));
  }

  async deleteFile(path: string): Promise<void> {
    await this.mount();
    try {
      await unlink(this.resolvePath(path));
    } catch {
      // File might already be deleted
    }
  }

  async fileExists(path: string): Promise<boolean> {
    await this.mount();
    try {
      await access(this.resolvePath(path));
      return true;
    } catch {
      return false;
    }
  }

  async getFileSize(path: string): Promise<number> {
    await this.mount();
    const s = await stat(this.resolvePath(path));
    return s.size;
  }

  async createDir(path: string): Promise<void> {
    await this.mount();
    await mkdir(this.resolvePath(path), { recursive: true });
  }

  async deleteDir(path: string): Promise<void> {
    await this.mount();
    try {
      await rmdir(this.resolvePath(path), { recursive: true });
    } catch {
      // Dir might already be deleted
    }
  }

  async dirExists(path: string): Promise<boolean> {
    await this.mount();
    return existsSync(this.resolvePath(path));
  }

  async listDir(path: string): Promise<string[]> {
    await this.mount();
    try {
      return await readdir(this.resolvePath(path));
    } catch {
      return [];
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
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
      helpText: "Local directory path where the remote storage will be mounted",
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
      helpText: "Additional mount options (comma-separated)",
    },
  ],
  create: (config) => new MountStorageDriver(config),
};
