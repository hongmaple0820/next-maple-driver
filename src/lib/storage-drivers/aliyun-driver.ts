import { CloudDriverBase } from "./cloud-driver-base";
import type {
  StorageDriverConfig,
  StorageDriverFactory,
  StorageDriverConfigField,
  OAuthConfig,
  FileInfo,
} from "./types";

/**
 * 阿里云盘 (Aliyun Drive) Driver
 *
 * Uses Aliyun Drive Open Platform OAuth2 API.
 * API docs: https://www.alipan.com/open/
 *
 * Key concepts:
 * - Uses file_id based system (not path-based)
 * - Each file/folder has a unique file_id
 * - Root directory has file_id "root"
 * - drive_id identifies the user's drive
 * - Path-to-fileId resolution is cached for efficiency
 *
 * OAuth2 Flow:
 * 1. User visits Aliyun Drive authorization URL
 * 2. Aliyun redirects back with authorization code
 * 3. Exchange code for access token + refresh token
 * 4. Use access token to call Aliyun Drive Open API
 */
export class AliyunDriver extends CloudDriverBase {
  readonly type = "aliyun";

  // Aliyun Drive Open API endpoints
  private static readonly API_BASE = "https://openapi.alipan.com";

  // Cached drive_id
  private driveId: string | null = null;

  // Path to file_id cache for efficient resolution
  private pathCache: Map<string, string> = new Map();

  constructor(config: StorageDriverConfig) {
    super(config);
    // Initialize cache with root
    this.pathCache.set("/", "root");
  }

  getOAuthConfig(): OAuthConfig {
    return {
      clientId: this.config.config.clientId || "",
      clientSecret: this.config.config.clientSecret || "",
      authorizationUrl: "https://openapi.alipan.com/oauth/authorize",
      tokenUrl: "https://openapi.alipan.com/oauth/access_token",
      scopes: ["user:base", "file:all:read", "file:all:write"],
      redirectUri: this.config.config.redirectUri || "",
    };
  }

  protected getMaxConcurrent(): number {
    return 5; // Aliyun Drive allows moderate concurrency
  }

  protected getMinInterval(): number {
    return 100;
  }

  /**
   * Get the user's drive_id. Caches after first fetch.
   */
  private async getDriveId(): Promise<string> {
    if (this.driveId) {
      return this.driveId;
    }

    const url = `${AliyunDriver.API_BASE}/adrive/v1.0/user/getDriveInfo`;
    const response = await this.apiRequest(url, {
      method: "POST",
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Aliyun getDriveId failed: ${response.status} ${errorText}`);
    }

    const data = await response.json() as {
      default_drive_id?: string;
      drive_id?: string;
    };

    this.driveId = data.default_drive_id || data.drive_id || "";
    if (!this.driveId) {
      throw new Error("Aliyun getDriveId: no drive_id returned");
    }

    return this.driveId;
  }

  /**
   * Resolve a path to a file_id by traversing the directory tree.
   * Results are cached for performance.
   */
  private async resolvePathToFileId(path: string): Promise<string> {
    // Normalize path
    const normalizedPath = path.replace(/^\/+|\/+$/g, "") || "/";

    // Check cache first
    if (this.pathCache.has(normalizedPath)) {
      return this.pathCache.get(normalizedPath)!;
    }

    // Traverse from root
    const parts = normalizedPath.split("/").filter(Boolean);
    let currentFileId = "root";

    for (const part of parts) {
      // Build the partial path for cache
      const partialPath = "/" + parts.slice(0, parts.indexOf(part) + 1).join("/");

      // Check cache for this partial path
      if (this.pathCache.has(partialPath)) {
        currentFileId = this.pathCache.get(partialPath)!;
        continue;
      }

      // List directory to find the child
      const driveId = await this.getDriveId();
      const listUrl = `${AliyunDriver.API_BASE}/adrive/v1.0/openFile/list`;
      const listResponse = await this.apiRequest(listUrl, {
        method: "POST",
        body: JSON.stringify({
          drive_id: driveId,
          parent_file_id: currentFileId,
        }),
      });

      if (!listResponse.ok) {
        throw new Error(`Aliyun resolvePath failed at ${partialPath}: ${listResponse.status}`);
      }

      const listData = await listResponse.json() as {
        items?: Array<{
          file_id: string;
          name: string;
          type: string;
        }>;
      };

      const found = listData.items?.find((item) => item.name === part);
      if (!found) {
        throw new Error(`Aliyun resolvePath: path component "${part}" not found`);
      }

      currentFileId = found.file_id;
      this.pathCache.set(partialPath, found.file_id);
    }

    return currentFileId;
  }

  /**
   * Get the parent file_id and filename from a path.
   */
  private async getParentFileIdAndName(path: string): Promise<{ parentFileId: string; name: string }> {
    const normalizedPath = path.replace(/^\/+|\/+$/g, "");
    const lastSlash = normalizedPath.lastIndexOf("/");
    const name = normalizedPath.substring(lastSlash + 1);
    const parentPath = normalizedPath.substring(0, lastSlash) || "/";

    const parentFileId = await this.resolvePathToFileId(parentPath);
    return { parentFileId, name };
  }

  // --- Aliyun Drive Open API implementations ---

  /**
   * List files in a directory on Aliyun Drive.
   * Uses Open API: POST /adrive/v1.0/openFile/list
   */
  async listDir(path: string): Promise<FileInfo[]> {
    return this.withRateLimit(async () => {
      const normalizedPath = path.replace(/^\/+|\/+$/g, "") || "/";
      const parentFileId = await this.resolvePathToFileId(normalizedPath);
      const driveId = await this.getDriveId();

      const allItems: FileInfo[] = [];
      let marker: string | undefined;

      // Paginate through all items
      do {
        const url = `${AliyunDriver.API_BASE}/adrive/v1.0/openFile/list`;
        const requestBody: Record<string, unknown> = {
          drive_id: driveId,
          parent_file_id: parentFileId,
          limit: 200,
        };
        if (marker) {
          requestBody.marker = marker;
        }

        const response = await this.apiRequest(url, {
          method: "POST",
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Aliyun listDir failed: ${response.status} ${errorText}`);
        }

        const data = await response.json() as {
          items?: Array<{
            file_id: string;
            name: string;
            type: string;
            size?: number;
            updated_at?: string;
            created_at?: string;
            mime_type?: string;
            mime_extension?: string;
            thumbnail_url?: string;
            md5?: string;
          }>;
          next_marker?: string;
        };

        if (data.items) {
          for (const item of data.items) {
            const itemPath = normalizedPath === "/" ? `/${item.name}` : `${normalizedPath}/${item.name}`;
            // Cache file_id by path
            this.pathCache.set(itemPath, item.file_id);

            allItems.push({
              name: item.name,
              size: item.size || 0,
              isDir: item.type === "folder",
              lastModified: item.updated_at ? new Date(item.updated_at) : undefined,
              created: item.created_at ? new Date(item.created_at) : undefined,
              mimeType: item.mime_type,
              id: item.file_id,
              parentPath: normalizedPath,
              extension: item.mime_extension,
              thumbnailUrl: item.thumbnail_url,
              md5: item.md5,
            });
          }
        }

        marker = data.next_marker;
      } while (marker);

      return allItems;
    });
  }

  /**
   * Upload a file to Aliyun Drive.
   * Uses two-phase upload: precreate → upload parts → complete
   */
  async writeFile(path: string, data: Buffer): Promise<void> {
    return this.withRateLimit(async () => {
      const { parentFileId, name } = await this.getParentFileIdAndName(path);
      const driveId = await this.getDriveId();

      // Step 1: Precreate
      const precreateUrl = `${AliyunDriver.API_BASE}/adrive/v1.0/openFile/create`;
      const precreateResponse = await this.apiRequest(precreateUrl, {
        method: "POST",
        body: JSON.stringify({
          drive_id: driveId,
          parent_file_id: parentFileId,
          name,
          type: "file",
          size: data.length,
          check_name_mode: "overwrite",
        }),
      });

      if (!precreateResponse.ok) {
        const errorText = await precreateResponse.text();
        throw new Error(`Aliyun precreate failed: ${precreateResponse.status} ${errorText}`);
      }

      const precreateData = await precreateResponse.json() as {
        file_id: string;
        upload_id: string;
        part_info_list?: Array<{
          part_number: number;
          upload_url: string;
        }>;
        exist?: boolean;
      };

      // If file already exists and is the same, skip upload
      if (precreateData.exist) {
        return;
      }

      const fileId = precreateData.file_id;
      const uploadId = precreateData.upload_id;

      // Step 2: Upload parts
      if (precreateData.part_info_list && precreateData.part_info_list.length > 0) {
        for (const partInfo of precreateData.part_info_list) {
          const partSize = Math.ceil(data.length / precreateData.part_info_list.length);
          const start = (partInfo.part_number - 1) * partSize;
          const end = Math.min(start + partSize, data.length);
          const partData = data.subarray(start, end);

          const uploadResponse = await fetch(partInfo.upload_url, {
            method: "PUT",
            body: partData,
            headers: {
              "Content-Type": "application/octet-stream",
            },
          });

          if (!uploadResponse.ok) {
            throw new Error(`Aliyun part upload failed for part ${partInfo.part_number}: ${uploadResponse.status}`);
          }
        }
      }

      // Step 3: Complete upload
      const completeUrl = `${AliyunDriver.API_BASE}/adrive/v1.0/openFile/complete`;
      const completeResponse = await this.apiRequest(completeUrl, {
        method: "POST",
        body: JSON.stringify({
          drive_id: driveId,
          file_id: fileId,
          upload_id: uploadId,
        }),
      });

      if (!completeResponse.ok) {
        const errorText = await completeResponse.text();
        throw new Error(`Aliyun complete upload failed: ${completeResponse.status} ${errorText}`);
      }

      // Invalidate cache for parent path
      const normalizedPath = path.replace(/^\/+|\/+$/g, "");
      const parentPath = normalizedPath.substring(0, normalizedPath.lastIndexOf("/")) || "/";
      this.pathCache.delete(normalizedPath);
      this.pathCache.delete(parentPath);
    });
  }

  /**
   * Download a file from Aliyun Drive.
   * First gets the download URL, then downloads the file content.
   */
  async readFile(path: string): Promise<Buffer> {
    return this.withRateLimit(async () => {
      const fileId = await this.resolvePathToFileId(path);
      const driveId = await this.getDriveId();

      // Get download URL
      const downloadUrl = `${AliyunDriver.API_BASE}/adrive/v1.0/openFile/getDownloadUrl`;
      const downloadResponse = await this.apiRequest(downloadUrl, {
        method: "POST",
        body: JSON.stringify({
          drive_id: driveId,
          file_id: fileId,
        }),
      });

      if (!downloadResponse.ok) {
        const errorText = await downloadResponse.text();
        throw new Error(`Aliyun getDownloadUrl failed: ${downloadResponse.status} ${errorText}`);
      }

      const downloadData = await downloadResponse.json() as {
        url?: string;
        expiration?: string;
      };

      if (!downloadData.url) {
        throw new Error("Aliyun readFile: no download URL returned");
      }

      // Download the file content
      const fileResponse = await fetch(downloadData.url);
      if (!fileResponse.ok) {
        throw new Error(`Aliyun file download failed: ${fileResponse.status}`);
      }

      const arrayBuffer = await fileResponse.arrayBuffer();
      return Buffer.from(arrayBuffer);
    });
  }

  /**
   * Delete a file by moving it to the recycle bin.
   * Uses POST /adrive/v1.0/openFile/recyclebin/trash
   */
  async deleteFile(path: string): Promise<void> {
    return this.withRateLimit(async () => {
      const fileId = await this.resolvePathToFileId(path);
      const driveId = await this.getDriveId();

      const url = `${AliyunDriver.API_BASE}/adrive/v1.0/openFile/recyclebin/trash`;
      const response = await this.apiRequest(url, {
        method: "POST",
        body: JSON.stringify({
          drive_id: driveId,
          file_id: fileId,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Aliyun deleteFile failed: ${response.status} ${errorText}`);
      }

      // Invalidate cache
      this.pathCache.delete(path.replace(/^\/+|\/+$/g, ""));
    });
  }

  async fileExists(path: string): Promise<boolean> {
    try {
      const fileId = await this.resolvePathToFileId(path);
      return !!fileId;
    } catch {
      return false;
    }
  }

  async getFileSize(path: string): Promise<number> {
    return this.withRateLimit(async () => {
      const fileId = await this.resolvePathToFileId(path);
      const driveId = await this.getDriveId();

      const url = `${AliyunDriver.API_BASE}/adrive/v1.0/openFile/get`;
      const response = await this.apiRequest(url, {
        method: "POST",
        body: JSON.stringify({
          drive_id: driveId,
          file_id: fileId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Aliyun getFileSize failed: ${response.status}`);
      }

      const data = await response.json() as { size?: number };
      return data.size || 0;
    });
  }

  /**
   * Create a directory on Aliyun Drive.
   * Uses POST /adrive/v1.0/openFile/create with type="folder"
   */
  async createDir(path: string): Promise<void> {
    return this.withRateLimit(async () => {
      const { parentFileId, name } = await this.getParentFileIdAndName(path);
      const driveId = await this.getDriveId();

      const url = `${AliyunDriver.API_BASE}/adrive/v1.0/openFile/create`;
      const response = await this.apiRequest(url, {
        method: "POST",
        body: JSON.stringify({
          drive_id: driveId,
          parent_file_id: parentFileId,
          name,
          type: "folder",
          check_name_mode: "refuse",
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Aliyun createDir failed: ${response.status} ${errorText}`);
      }

      const data = await response.json() as { file_id?: string };
      if (data.file_id) {
        const normalizedPath = path.replace(/^\/+|\/+$/g, "");
        this.pathCache.set(normalizedPath, data.file_id);
      }
    });
  }

  /**
   * Delete a directory by moving it to the recycle bin.
   */
  async deleteDir(path: string): Promise<void> {
    return this.deleteFile(path);
  }

  async dirExists(path: string): Promise<boolean> {
    try {
      const fileId = await this.resolvePathToFileId(path);
      const driveId = await this.getDriveId();

      const url = `${AliyunDriver.API_BASE}/adrive/v1.0/openFile/get`;
      const response = await this.apiRequest(url, {
        method: "POST",
        body: JSON.stringify({
          drive_id: driveId,
          file_id: fileId,
        }),
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json() as { type?: string };
      return data.type === "folder";
    } catch {
      return false;
    }
  }

  /**
   * Get storage info from Aliyun Drive.
   */
  async getStorageInfo(): Promise<{ used: number; total: number; available: number }> {
    return this.withRateLimit(async () => {
      const driveId = await this.getDriveId();

      const url = `${AliyunDriver.API_BASE}/adrive/v1.0/user/getDriveInfo`;
      const response = await this.apiRequest(url, {
        method: "POST",
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        throw new Error(`Aliyun getStorageInfo failed: ${response.status}`);
      }

      const data = await response.json() as {
        used_size?: number;
        total_size?: number;
        drive_used_size?: number;
        drive_total_size?: number;
      };

      const used = data.used_size || data.drive_used_size || 0;
      const total = data.total_size || data.drive_total_size || 107374182400;
      return { used, total, available: total - used };
    });
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    const authStatus = this.getAuthStatus();
    if (authStatus === "authorized") {
      return { healthy: true, message: "阿里云盘已连接" };
    }
    if (authStatus === "expired") {
      return { healthy: false, message: "阿里云盘授权已过期，请重新授权" };
    }
    return { healthy: false, message: "阿里云盘需要授权" };
  }
}

export const aliyunDriverFactory: StorageDriverFactory = {
  type: "aliyun",
  displayName: "阿里云盘",
  description: "连接到阿里云盘，支持文件上传、下载和管理",
  authType: "oauth",
  configFields: [
    {
      key: "clientId",
      label: "Client ID",
      type: "text",
      required: true,
      placeholder: "your-client-id",
      helpText: "阿里云盘开放平台应用的 Client ID",
    },
    {
      key: "clientSecret",
      label: "Client Secret",
      type: "password",
      required: true,
      placeholder: "••••••••",
      helpText: "阿里云盘开放平台应用的 Client Secret",
    },
    {
      key: "redirectUri",
      label: "Redirect URI",
      type: "url",
      required: false,
      placeholder: "https://your-domain.com/api/auth/cloud-oauth/callback",
      helpText: "OAuth 回调地址（留空使用默认值）",
    },
    {
      key: "refreshToken",
      label: "Refresh Token",
      type: "password",
      required: false,
      placeholder: "已授权的 refresh token",
      helpText: "如已有 refresh token 可直接填入",
    },
  ],
  create: (config) => new AliyunDriver(config),
};
