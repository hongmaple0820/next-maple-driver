import { CloudDriverBase } from "./cloud-driver-base";
import type {
  StorageDriverConfig,
  StorageDriverFactory,
  StorageDriverConfigField,
  OAuthConfig,
  OAuthTokenResponse,
  FileInfo,
} from "./types";

// ---- Aliyun Drive API Response Types ----

interface AliyunDriveInfoResponse {
  default_drive_id?: string;
  drive_id?: string;
  used_size?: number;
  total_size?: number;
  drive_used_size?: number;
  drive_total_size?: number;
}

interface AliyunFileItem {
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
  parent_file_id?: string;
  file_name?: string;
  category?: string;
  encrypt_mode?: string;
  trashed?: boolean;
}

interface AliyunListResponse {
  items?: AliyunFileItem[];
  next_marker?: string;
}

interface AliyunPrecreateResponse {
  file_id: string;
  upload_id: string;
  part_info_list?: Array<{
    part_number: number;
    upload_url: string;
  }>;
  exist?: boolean;
}

interface AliyunDownloadUrlResponse {
  url?: string;
  expiration?: string;
  method?: string;
}

interface AliyunUserInfoResponse {
  user_id?: string;
  nick_name?: string;
  avatar?: string;
}

interface AliyunErrorResponse {
  code?: string;
  message?: string;
}

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
 *
 * Direct Refresh Token Flow:
 * If user provides a refresh_token directly, the driver automatically
 * exchanges it for an access token without requiring the full OAuth flow.
 */
export class AliyunDriver extends CloudDriverBase {
  readonly type = "aliyun";

  // Aliyun Drive Open API endpoints (open.alipan.com is the current domain)
  private static readonly API_BASE = "https://open.alipan.com";

  // Cached drive_id
  private driveId: string | null = null;

  // Path to file_id cache for efficient resolution
  private pathCache: Map<string, string> = new Map();

  // Whether we've attempted initial token exchange from a provided refresh_token
  private initialTokenExchangeDone = false;

  constructor(config: StorageDriverConfig) {
    super(config);
    // Initialize cache with root
    this.pathCache.set("/", "root");
  }

  getOAuthConfig(): OAuthConfig {
    return {
      clientId: this.config.config.clientId || "",
      clientSecret: this.config.config.clientSecret || "",
      authorizationUrl: "https://open.alipan.com/oauth/authorize",
      tokenUrl: "https://open.alipan.com/oauth/access_token",
      scopes: ["user:base", "file:all:read", "file:all:write"],
      redirectUri: this.config.config.redirectUri || "",
      // Aliyun requires biz_type=openspace for open space authorization
      extraAuthParams: {
        biz_type: "openspace",
      },
    };
  }

  protected getMaxConcurrent(): number {
    return 5; // Aliyun Drive allows moderate concurrency
  }

  protected getMinInterval(): number {
    return 100;
  }

  /**
   * Override refreshAccessToken to properly pass refresh_token in request body.
   * Aliyun requires the refresh_token to be included explicitly in the body.
   */
  async refreshAccessToken(): Promise<OAuthTokenResponse> {
    if (!this.refreshToken) {
      throw new Error("阿里云盘刷新令牌失败：没有可用的 refresh_token");
    }

    const oauthConfig = this.getOAuthConfig();
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.refreshToken,
      client_id: oauthConfig.clientId,
      client_secret: oauthConfig.clientSecret,
    });

    const response = await fetch(oauthConfig.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.handleApiError("刷新令牌", response.status, errorText);
    }

    const data = await response.json() as OAuthTokenResponse & { refresh_token: string };

    // Aliyun rotates refresh tokens — always update with the new one
    this.accessToken = data.access_token;
    if (data.refresh_token) {
      this.refreshToken = data.refresh_token;
    }
    this.tokenExpiresAt = new Date(Date.now() + (data.expires_in || 7200) * 1000);

    return data;
  }

  /**
   * Override ensureValidToken to support direct refresh_token input.
   * If a refresh_token was provided in config but no access_token exists,
   * automatically exchange it for an access token.
   */
  async ensureValidToken(): Promise<string> {
    // If we have a refresh_token but no access_token, try to exchange it
    if (this.refreshToken && !this.accessToken && !this.initialTokenExchangeDone) {
      this.initialTokenExchangeDone = true;
      try {
        await this.refreshAccessToken();
      } catch (error) {
        throw new Error(
          `阿里云盘使用 refresh_token 获取访问令牌失败：${error instanceof Error ? error.message : "未知错误"}`
        );
      }
    }

    // Check if token is expired
    if (this.accessToken && this.tokenExpiresAt && this.tokenExpiresAt <= new Date()) {
      if (this.refreshToken) {
        await this.refreshAccessToken();
      } else {
        throw new Error("阿里云盘访问令牌已过期且没有 refresh_token，请重新授权");
      }
    }

    return this.accessToken;
  }

  /**
   * Handle common Aliyun API errors and throw descriptive messages.
   */
  private handleApiError(operation: string, statusCode: number, errorBody: string): never {
    let message: string;

    try {
      const errorData = JSON.parse(errorBody) as AliyunErrorResponse;
      const code = errorData.code || "";
      const msg = errorData.message || "";

      switch (code) {
        case "AccessTokenInvalid":
          message = `阿里云盘${operation}失败：访问令牌无效，请重新授权`;
          break;
        case "RefreshTokenInvalid":
          message = `阿里云盘${operation}失败：刷新令牌无效，请重新授权`;
          break;
        case "AccessTokenExpired":
          message = `阿里云盘${operation}失败：访问令牌已过期，请重新授权`;
          break;
        case "ForbiddenFileNotExists":
          message = `阿里云盘${operation}失败：文件不存在或无权访问`;
          break;
        case "ForbiddenNoPermissionFile":
          message = `阿里云盘${operation}失败：没有文件操作权限`;
          break;
        case "TooManyRequests":
          message = `阿里云盘${operation}失败：请求过于频繁，请稍后重试`;
          break;
        case "DeviceSessionSignatureInvalid":
          message = `阿里云盘${operation}失败：设备会话签名无效`;
          break;
        default:
          message = `阿里云盘${operation}失败：${code ? `[${code}] ` : ""}${msg || `HTTP ${statusCode}`}`;
      }
    } catch {
      if (statusCode === 429) {
        message = `阿里云盘${operation}失败：请求过于频繁，请稍后重试`;
      } else if (statusCode === 401) {
        message = `阿里云盘${operation}失败：认证失败，请重新授权`;
      } else if (statusCode === 403) {
        message = `阿里云盘${operation}失败：没有权限执行此操作`;
      } else {
        message = `阿里云盘${operation}失败：HTTP ${statusCode} ${errorBody}`;
      }
    }

    throw new Error(message);
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
      this.handleApiError("获取驱动信息", response.status, errorText);
    }

    const data = await response.json() as AliyunDriveInfoResponse;

    this.driveId = data.default_drive_id || data.drive_id || "";
    if (!this.driveId) {
      throw new Error("阿里云盘获取驱动信息失败：未返回 drive_id");
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
        const errorText = await listResponse.text();
        this.handleApiError(`路径解析（${partialPath}）`, listResponse.status, errorText);
      }

      const listData = await listResponse.json() as AliyunListResponse;

      const found = listData.items?.find((item) => item.name === part);
      if (!found) {
        throw new Error(`阿里云盘路径解析失败：路径组件 "${part}" 不存在`);
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
   * Get detailed information about a specific file.
   * Uses POST /adrive/v1.0/openFile/get
   */
  async getFileInfo(path: string): Promise<FileInfo | null> {
    return this.withRateLimit(async () => {
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
          if (response.status === 404) {
            return null;
          }
          const errorText = await response.text();
          this.handleApiError("获取文件信息", response.status, errorText);
        }

        const data = await response.json() as AliyunFileItem;
        const normalizedPath = path.replace(/^\/+|\/+$/g, "");

        return {
          name: data.name || data.file_name || "",
          size: data.size || 0,
          isDir: data.type === "folder",
          lastModified: data.updated_at ? new Date(data.updated_at) : undefined,
          created: data.created_at ? new Date(data.created_at) : undefined,
          mimeType: data.mime_type,
          id: data.file_id,
          parentPath: normalizedPath.substring(0, normalizedPath.lastIndexOf("/")) || "/",
          extension: data.mime_extension,
          thumbnailUrl: data.thumbnail_url,
          md5: data.md5,
        };
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("不存在")
        ) {
          return null;
        }
        throw error;
      }
    });
  }

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
          this.handleApiError("列出目录", response.status, errorText);
        }

        const data = await response.json() as AliyunListResponse;

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
        this.handleApiError("创建文件", precreateResponse.status, errorText);
      }

      const precreateData = await precreateResponse.json() as AliyunPrecreateResponse;

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
            throw new Error(`阿里云盘分片上传失败（分片 ${partInfo.part_number}）：HTTP ${uploadResponse.status}`);
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
        this.handleApiError("完成上传", completeResponse.status, errorText);
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
      const downloadUrl = await this.getDownloadLink(path);

      // Download the file content
      const fileResponse = await fetch(downloadUrl);
      if (!fileResponse.ok) {
        throw new Error(`阿里云盘文件下载失败：HTTP ${fileResponse.status}`);
      }

      const arrayBuffer = await fileResponse.arrayBuffer();
      return Buffer.from(arrayBuffer);
    });
  }

  /**
   * Get the download URL for a file on Aliyun Drive.
   * Returns the download_url from the Aliyun Open API.
   */
  async getDownloadLink(path: string): Promise<string> {
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
        this.handleApiError("获取下载链接", downloadResponse.status, errorText);
      }

      const downloadData = await downloadResponse.json() as AliyunDownloadUrlResponse;

      if (!downloadData.url) {
        throw new Error("阿里云盘获取下载链接失败：未返回下载地址");
      }

      return downloadData.url;
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
        this.handleApiError("删除文件", response.status, errorText);
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
      const info = await this.getFileInfo(path);
      return info?.size || 0;
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
        this.handleApiError("创建目录", response.status, errorText);
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
      const info = await this.getFileInfo(path);
      return info?.isDir === true;
    } catch {
      return false;
    }
  }

  /**
   * Get storage info from Aliyun Drive.
   */
  async getStorageInfo(): Promise<{ used: number; total: number; available: number }> {
    return this.withRateLimit(async () => {
      const url = `${AliyunDriver.API_BASE}/adrive/v1.0/user/getDriveInfo`;
      const response = await this.apiRequest(url, {
        method: "POST",
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        throw new Error(`阿里云盘获取存储信息失败：HTTP ${response.status}`);
      }

      const data = await response.json() as AliyunDriveInfoResponse;

      const used = data.used_size || data.drive_used_size || 0;
      const total = data.total_size || data.drive_total_size || 107374182400;
      return { used, total, available: total - used };
    });
  }

  /**
   * Health check: actually calls the API to verify the token works.
   */
  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    try {
      // Try to get user info to verify the token is valid
      const url = `${AliyunDriver.API_BASE}/adrive/v1.0/user/getDriveInfo`;
      const response = await this.apiRequest(url, {
        method: "POST",
        body: JSON.stringify({}),
      });

      if (response.ok) {
        const data = await response.json() as AliyunUserInfoResponse & AliyunDriveInfoResponse;
        const nickName = data.nick_name || "";
        return {
          healthy: true,
          message: nickName ? `阿里云盘已连接（用户：${nickName}）` : "阿里云盘已连接",
        };
      }

      if (response.status === 401 || response.status === 403) {
        return { healthy: false, message: "阿里云盘授权已过期，请重新授权" };
      }

      return { healthy: false, message: `阿里云盘连接异常：HTTP ${response.status}` };
    } catch (error) {
      return {
        healthy: false,
        message: `阿里云盘健康检查失败：${error instanceof Error ? error.message : "未知错误"}`,
      };
    }
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
      helpText: "如已有 refresh token 可直接填入，将自动获取访问令牌，无需 OAuth 授权流程",
    },
  ],
  create: (config) => new AliyunDriver(config),
};
