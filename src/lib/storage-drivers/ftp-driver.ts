import type { StorageDriver, StorageDriverConfig, StorageDriverFactory, StorageDriverConfigField, FileInfo } from "./types";
import { readFile as fsReadFile } from "fs/promises";
import { Writable } from "stream";
import * as ftp from "basic-ftp";
import * as ssh2 from "ssh2";

interface FTPDriverConfig {
  protocol: "ftp" | "sftp";
  host: string;
  port?: number;
  username: string;
  password?: string;
  pathPrefix?: string;
  // SFTP-specific
  privateKey?: string;       // Path to SSH private key
  passphrase?: string;       // Passphrase for private key
  // FTP-specific
  secure?: boolean;          // Use FTPS (explicit TLS)
}

export class FTPStorageDriver implements StorageDriver {
  readonly type = "ftp";
  readonly config: StorageDriverConfig;
  private ftpConfig: FTPDriverConfig;
  private pathPrefix: string;

  constructor(config: StorageDriverConfig) {
    this.config = config;
    this.ftpConfig = config.config as unknown as FTPDriverConfig;
    this.pathPrefix = (this.ftpConfig.pathPrefix || "").replace(/^\/+|\/+$/g, "");
  }

  private getKey(path: string): string {
    const cleanPath = path.replace(/^\/+/, "");
    return this.pathPrefix ? `${this.pathPrefix}/${cleanPath}` : cleanPath;
  }

  // Create an FTP client connection
  private async createFTPClient(): Promise<ftp.Client> {
    const client = new ftp.Client();
    client.ftp.verbose = false;

    const port = this.ftpConfig.port || (this.ftpConfig.secure ? 990 : 21);

    try {
      if (this.ftpConfig.secure) {
        await client.access({
          host: this.ftpConfig.host,
          port,
          user: this.ftpConfig.username || "anonymous",
          password: this.ftpConfig.password || "",
          secure: true,
          secureOptions: { rejectUnauthorized: false },
        });
      } else {
        await client.access({
          host: this.ftpConfig.host,
          port,
          user: this.ftpConfig.username || "anonymous",
          password: this.ftpConfig.password || "",
        });
      }
    } catch (err) {
      client.close();
      throw new Error(`FTP connection failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }

    return client;
  }

  // Create an SFTP connection using ssh2
  private async createSFTPClient(): Promise<ssh2.Client> {
    return new Promise((resolve, reject) => {
      const conn = new ssh2.Client();

      const port = this.ftpConfig.port || 22;

      const connectConfig: ssh2.ConnectConfig = {
        host: this.ftpConfig.host,
        port,
        username: this.ftpConfig.username,
      };

      if (this.ftpConfig.privateKey) {
        // Read private key file asynchronously
        fsReadFile(this.ftpConfig.privateKey)
          .then(keyBuffer => {
            connectConfig.privateKey = keyBuffer;
            if (this.ftpConfig.passphrase) {
              connectConfig.passphrase = this.ftpConfig.passphrase;
            }
            conn.connect(connectConfig);
          })
          .catch(err => reject(new Error(`Failed to read private key: ${err instanceof Error ? err.message : 'Unknown error'}`)));
      } else {
        connectConfig.password = this.ftpConfig.password;
        conn.connect(connectConfig);
      }

      conn.on("ready", () => resolve(conn));
      conn.on("error", (err) => reject(new Error(`SFTP connection failed: ${err.message}`)));
    });
  }

  // Get SFTP session
  private async getSFTPSession(conn: ssh2.Client): Promise<ssh2.SFTPWrapper> {
    return new Promise((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) reject(err);
        else resolve(sftp);
      });
    });
  }

  // Determine if using SFTP or FTP
  private get isSFTP(): boolean {
    return this.ftpConfig.protocol === "sftp";
  }

  async writeFile(path: string, data: Buffer): Promise<void> {
    const remotePath = this.getKey(path);

    if (this.isSFTP) {
      const conn = await this.createSFTPClient();
      try {
        const sftp = await this.getSFTPSession(conn);
        // Ensure parent directory exists
        const parentDir = remotePath.substring(0, remotePath.lastIndexOf("/"));
        if (parentDir) {
          await this.sftpMkdirp(sftp, parentDir);
        }
        await new Promise<void>((resolve, reject) => {
          const stream = sftp.createWriteStream(remotePath);
          stream.on("error", reject);
          stream.on("finish", resolve);
          stream.end(data);
        });
      } finally {
        conn.end();
      }
    } else {
      const client = await this.createFTPClient();
      try {
        // Ensure parent directory exists
        const parentDir = remotePath.substring(0, remotePath.lastIndexOf("/"));
        if (parentDir) {
          await client.ensureDir(parentDir);
        }
        await client.uploadFrom(Buffer.from(data), remotePath);
      } finally {
        client.close();
      }
    }
  }

  async readFile(path: string): Promise<Buffer> {
    const remotePath = this.getKey(path);

    if (this.isSFTP) {
      const conn = await this.createSFTPClient();
      try {
        const sftp = await this.getSFTPSession(conn);
        return await new Promise<Buffer>((resolve, reject) => {
          const chunks: Buffer[] = [];
          const stream = sftp.createReadStream(remotePath);
          stream.on("data", (chunk: Buffer) => chunks.push(chunk));
          stream.on("error", reject);
          stream.on("end", () => resolve(Buffer.concat(chunks)));
        });
      } finally {
        conn.end();
      }
    } else {
      const client = await this.createFTPClient();
      try {
        const chunks: Buffer[] = [];
        const writable = new Writable({
          write(chunk: Buffer, _encoding: string, callback: () => void) {
            chunks.push(chunk);
            callback();
          },
        });
        await client.downloadTo(writable, remotePath);
        return Buffer.concat(chunks);
      } finally {
        client.close();
      }
    }
  }

  async deleteFile(path: string): Promise<void> {
    const remotePath = this.getKey(path);
    if (this.isSFTP) {
      const conn = await this.createSFTPClient();
      try {
        const sftp = await this.getSFTPSession(conn);
        await new Promise<void>((resolve, reject) => {
          sftp.unlink(remotePath, (err) => {
            if (err && err.message !== "No such file") reject(err);
            else resolve();
          });
        });
      } finally {
        conn.end();
      }
    } else {
      const client = await this.createFTPClient();
      try {
        await client.remove(remotePath);
      } catch {
        // File might already be deleted
      } finally {
        client.close();
      }
    }
  }

  async fileExists(path: string): Promise<boolean> {
    try {
      const info = await this.getFileInfo(path);
      return info !== null && !info.isDir;
    } catch {
      return false;
    }
  }

  async getFileSize(path: string): Promise<number> {
    const info = await this.getFileInfo(path);
    return info?.size ?? 0;
  }

  async createDir(path: string): Promise<void> {
    const remotePath = this.getKey(path);
    if (this.isSFTP) {
      const conn = await this.createSFTPClient();
      try {
        const sftp = await this.getSFTPSession(conn);
        await this.sftpMkdirp(sftp, remotePath);
      } finally {
        conn.end();
      }
    } else {
      const client = await this.createFTPClient();
      try {
        await client.ensureDir(remotePath);
      } finally {
        client.close();
      }
    }
  }

  async deleteDir(path: string): Promise<void> {
    const remotePath = this.getKey(path);
    if (this.isSFTP) {
      const conn = await this.createSFTPClient();
      try {
        const sftp = await this.getSFTPSession(conn);
        await this.sftpRmdir(sftp, remotePath);
      } finally {
        conn.end();
      }
    } else {
      const client = await this.createFTPClient();
      try {
        await client.removeDir(remotePath);
      } finally {
        client.close();
      }
    }
  }

  async dirExists(path: string): Promise<boolean> {
    try {
      const info = await this.getFileInfo(path);
      return info !== null && info.isDir;
    } catch {
      return false;
    }
  }

  async listDir(path: string): Promise<FileInfo[]> {
    const remotePath = this.getKey(path) || "/";

    if (this.isSFTP) {
      const conn = await this.createSFTPClient();
      try {
        const sftp = await this.getSFTPSession(conn);
        return await this.sftpListDir(sftp, remotePath);
      } finally {
        conn.end();
      }
    } else {
      const client = await this.createFTPClient();
      try {
        return await this.ftpListDir(client, remotePath);
      } finally {
        client.close();
      }
    }
  }

  async getFileInfo(path: string): Promise<FileInfo | null> {
    const remotePath = this.getKey(path);

    if (this.isSFTP) {
      const conn = await this.createSFTPClient();
      try {
        const sftp = await this.getSFTPSession(conn);
        return await new Promise<FileInfo | null>((resolve) => {
          sftp.stat(remotePath, (err, stats) => {
            if (err) {
              resolve(null);
              return;
            }
            resolve({
              name: path.split("/").pop() || path,
              size: (stats as ssh2.Stats).size || 0,
              isDir: (stats as ssh2.Stats).isDirectory(),
              lastModified: new Date((stats as ssh2.Stats).mtime * 1000),
              created: new Date((stats as ssh2.Stats).atime * 1000),
            });
          });
        });
      } finally {
        conn.end();
      }
    } else {
      const client = await this.createFTPClient();
      try {
        // FTP doesn't have a direct stat command, try listing parent and finding the file
        const parentPath = remotePath.substring(0, remotePath.lastIndexOf("/")) || "/";
        const fileName = remotePath.split("/").pop() || "";
        const items = await this.ftpListDir(client, parentPath);
        return items.find(i => i.name === fileName) || null;
      } finally {
        client.close();
      }
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    try {
      if (this.isSFTP) {
        const conn = await this.createSFTPClient();
        conn.end();
        return { healthy: true, message: `SFTP connection to ${this.ftpConfig.host} successful` };
      } else {
        const client = await this.createFTPClient();
        client.close();
        return { healthy: true, message: `FTP connection to ${this.ftpConfig.host} successful` };
      }
    } catch (err) {
      return {
        healthy: false,
        message: `Connection failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      };
    }
  }

  async getStorageInfo(): Promise<{ used: number; total: number; available: number }> {
    // FTP/SFTP typically don't provide storage info
    return { used: 0, total: 0, available: 0 };
  }

  // ---- Helper methods ----

  private async ftpListDir(client: ftp.Client, remotePath: string): Promise<FileInfo[]> {
    try {
      const items = await client.list(remotePath);
      return items.map(item => ({
        name: item.name,
        size: item.size,
        isDir: item.isDirectory,
        lastModified: item.modifiedAt || (item.rawModifiedAt ? new Date(item.rawModifiedAt) : undefined),
      }));
    } catch {
      return [];
    }
  }

  private async sftpListDir(sftp: ssh2.SFTPWrapper, remotePath: string): Promise<FileInfo[]> {
    return new Promise((resolve) => {
      sftp.readdir(remotePath, (err, items) => {
        if (err) {
          resolve([]);
          return;
        }
        resolve(
          items.map(item => ({
            name: item.filename,
            size: (item.attrs as ssh2.Stats).size || 0,
            isDir: (item.attrs as ssh2.Stats).isDirectory(),
            lastModified: (item.attrs as ssh2.Stats).mtime ? new Date((item.attrs as ssh2.Stats).mtime * 1000) : undefined,
          }))
        );
      });
    });
  }

  private async sftpMkdirp(sftp: ssh2.SFTPWrapper, remotePath: string): Promise<void> {
    const parts = remotePath.split("/").filter(Boolean);
    let currentPath = "";
    for (const part of parts) {
      currentPath += "/" + part;
      await new Promise<void>((resolve) => {
        sftp.mkdir(currentPath, (err) => {
          // Ignore error if directory already exists
          void err;
          resolve();
        });
      });
    }
  }

  private async sftpRmdir(sftp: ssh2.SFTPWrapper, remotePath: string): Promise<void> {
    // First, remove all contents
    const items = await this.sftpListDir(sftp, remotePath);
    for (const item of items) {
      const itemPath = `${remotePath}/${item.name}`;
      if (item.isDir) {
        await this.sftpRmdir(sftp, itemPath);
      } else {
        await new Promise<void>((resolve) => {
          sftp.unlink(itemPath, () => resolve());
        });
      }
    }
    // Then remove the directory itself
    await new Promise<void>((resolve) => {
      sftp.rmdir(remotePath, () => resolve());
    });
  }
}

export const ftpDriverFactory: StorageDriverFactory = {
  type: "ftp",
  displayName: "FTP / SFTP",
  description: "Connect to FTP or SFTP servers for file access",
  configFields: [
    {
      key: "protocol",
      label: "Protocol",
      type: "text",
      required: true,
      placeholder: "sftp",
      defaultValue: "sftp",
      helpText: "Choose 'ftp' for standard FTP/FTPS, or 'sftp' for SSH-based SFTP",
    },
    {
      key: "host",
      label: "Host",
      type: "text",
      required: true,
      placeholder: "ftp.example.com",
    },
    {
      key: "port",
      label: "Port",
      type: "number",
      required: false,
      placeholder: "21 (FTP) / 22 (SFTP)",
      helpText: "Default: 21 for FTP, 22 for SFTP",
    },
    {
      key: "username",
      label: "Username",
      type: "text",
      required: true,
      placeholder: "user",
    },
    {
      key: "password",
      label: "Password",
      type: "password",
      required: false,
      placeholder: "••••••••",
      helpText: "Password for FTP or SFTP authentication",
    },
    {
      key: "privateKey",
      label: "SSH Private Key Path (SFTP)",
      type: "path",
      required: false,
      placeholder: "/home/user/.ssh/id_rsa",
      helpText: "Path to SSH private key file (SFTP only, alternative to password)",
    },
    {
      key: "passphrase",
      label: "Private Key Passphrase (SFTP)",
      type: "password",
      required: false,
      placeholder: "••••••••",
      helpText: "Passphrase for the SSH private key (if encrypted)",
    },
    {
      key: "secure",
      label: "Use FTPS (FTP over TLS)",
      type: "text",
      required: false,
      placeholder: "false",
      defaultValue: "false",
      helpText: "Set to 'true' for explicit FTPS (FTP only)",
    },
    {
      key: "pathPrefix",
      label: "Path Prefix",
      type: "text",
      required: false,
      placeholder: "/uploads",
      helpText: "Optional subdirectory within the FTP/SFTP root",
    },
  ],
  create: (config) => new FTPStorageDriver(config),
};
