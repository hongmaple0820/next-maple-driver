import crypto from "crypto";
import { CloudDriverBase } from "./cloud-driver-base";
import type {
  StorageDriverConfig,
  StorageDriverFactory,
  StorageDriverConfigField,
  OAuthConfig,
  OAuthTokenResponse,
  FileInfo,
} from "./types";

// ---- Baidu Drive API Response Types ----

interface BaiduListItem {
  fs_id: number;
  path: string;
  server_filename: string;
  size: number;
  isdir: number;
  mtime: number;
  ctime: number;
  md5?: string;
  category?: number;
  server_ctime?: number;
  server_mtime?: number;
  share?: number;
  plas?: number;
  file_key?: string;
}

interface BaiduListResponse {
  list?: BaiduListItem[];
  errno?: number;
  guide_dir?: number;
}

interface BaiduDlinkResponse {
  dlink?: string;
  errno?: number;
  list?: Array<{
    dlink?: string;
    fs_id?: number;
    md5?: string;
  }>;
}

interface BaiduQuotaResponse {
  used?: number;
  total?: number;
  errno?: number;
}

interface BaiduUserInfoResponse {
  baidu_name?: string;
  netdisk_name?: string;
  uk?: number;
  vip_type?: number;
  vip?: number;
  errno?: number;
}

interface BaiduTokenResponse extends OAuthTokenResponse {
  session_secret?: string;
  session_key?: string;
}

/**
 * 百度网盘 (Baidu Wangpan) Driver
 *
 * Uses Baidu PCS OAuth2 API for authentication.
 * API docs: https://pan.baidu.com/union/doc/
 *
 * OAuth2 Flow:
 * 1. User visits Baidu authorization URL
 * 2. Baidu redirects back with authorization code
 * 3. Exchange code for access token + refresh token
 * 4. Use access token to call PCS API endpoints
 *
 * Baidu PCS uses path-based file system. All paths should be absolute
 * starting with /apps/{app_dir}/ where app_dir is the app's directory.
 *
 * Direct Refresh Token Flow:
 * If user provides a refresh_token directly, the driver automatically
 * exchanges it for an access token without requiring the full OAuth flow.
 */
export class BaiduDriver extends CloudDriverBase {
  readonly type = "baidu";

  // Baidu PCS API endpoints
  private static readonly API_BASE = "https://pan.baidu.com/rest/2.0/xpan";
  private static readonly UPLOAD_URL = "https://d.pcs.baidu.com/rest/2.0/pcs/superfile2";
  private static readonly DOWNLOAD_URL = "https://d.pcs.baidu.com/rest/2.0/pcs/file";
  private static readonly SMALL_FILE_UPLOAD_URL = "https://d.pcs.baidu.com/rest/2.0/pcs/file";

  // Path prefix for Baidu PCS API (apps directory)
  private appDir: string;

  // Session data from Baidu OAuth (stored but not used for API calls currently)
  private sessionSecret: string = "";
  private sessionKey: string = "";

  // Whether we've attempted initial token exchange from a provided refresh_token
  private initialTokenExchangeDone = false;

  constructor(config: StorageDriverConfig) {
    super(config);
    this.appDir = config.config.appDir || "/apps/CloudDrive";
  }

  getOAuthConfig(): OAuthConfig {
    return {
      clientId: this.config.config.clientId || "",
      clientSecret: this.config.config.clientSecret || "",
      authorizationUrl: "https://openapi.baidu.com/oauth/2.0/authorize",
      tokenUrl: "https://openapi.baidu.com/oauth/2.0/token",
      scopes: ["basic", "netdisk"],
      redirectUri: this.config.config.redirectUri || "",
      extraAuthParams: {
        display: "popup",
      },
    };
  }

  protected getMaxConcurrent(): number {
    return 3; // Baidu has stricter rate limits
  }

  protected getMinInterval(): number {
    return 200; // 200ms between calls
  }

  /**
   * Override refreshAccessToken to use the correct Baidu token endpoint
   * with grant_type=refresh_token and store session data.
   */
  async refreshAccessToken(): Promise<OAuthTokenResponse> {
    if (!this.refreshToken) {
      throw new Error("百度网盘刷新令牌失败：没有可用的 refresh_token");
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

    const data = await response.json() as BaiduTokenResponse;

    this.accessToken = data.access_token;
    if (data.refresh_token) {
      this.refreshToken = data.refresh_token;
    }
    this.tokenExpiresAt = new Date(Date.now() + (data.expires_in || 2592000) * 1000);

    // Store session data from Baidu OAuth response
    if (data.session_secret) {
      this.sessionSecret = data.session_secret;
    }
    if (data.session_key) {
      this.sessionKey = data.session_key;
    }

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
          `百度网盘使用 refresh_token 获取访问令牌失败：${error instanceof Error ? error.message : "未知错误"}`
        );
      }
    }

    // Check if token is expired
    if (this.accessToken && this.tokenExpiresAt && this.tokenExpiresAt <= new Date()) {
      if (this.refreshToken) {
        await this.refreshAccessToken();
      } else {
        throw new Error("百度网盘访问令牌已过期且没有 refresh_token，请重新授权");
      }
    }

    return this.accessToken;
  }

  /**
   * Override apiRequest to append access_token as a query parameter
   * for Baidu-specific API calls. Baidu requires access_token in the URL,
   * not just in the Authorization header.
   */
  protected async apiRequest(url: string, options: RequestInit = {}): Promise<Response> {
    const token = await this.ensureValidToken();

    // Append access_token to URL query string for Baidu API calls
    const urlObj = new URL(url);
    urlObj.searchParams.set("access_token", token);
    const finalUrl = urlObj.toString();

    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${token}`);
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(finalUrl, { ...options, headers });

    // Handle 401 - try to refresh token and retry
    if (response.status === 401) {
      try {
        await this.refreshAccessToken();
        const newToken = this.accessToken;
        urlObj.searchParams.set("access_token", newToken);
        headers.set("Authorization", `Bearer ${newToken}`);
        return fetch(urlObj.toString(), { ...options, headers });
      } catch {
        // If refresh fails, return the original response
        return response;
      }
    }

    return response;
  }

  /**
   * Handle common Baidu API errors and throw descriptive messages.
   */
  private handleApiError(operation: string, statusCode: number, errorBody: string): never {
    let message: string;

    try {
      const errorData = JSON.parse(errorBody) as { error?: string; error_description?: string; errno?: number };
      const code = errorData.error || "";
      const desc = errorData.error_description || "";
      const errno = errorData.errno;

      // Handle Baidu OAuth errors
      if (code) {
        switch (code) {
          case "invalid_grant":
            message = `百度网盘${operation}失败：授权码无效或已过期，请重新授权`;
            break;
          case "invalid_client":
            message = `百度网盘${operation}失败：Client ID 或 Client Secret 无效`;
            break;
          case "expired_token":
            message = `百度网盘${operation}失败：访问令牌已过期，请重新授权`;
            break;
          default:
            message = `百度网盘${operation}失败：${desc || code}`;
        }
      } else if (errno !== undefined) {
        // Handle Baidu PCS errno errors
        switch (errno) {
          case -1:
            message = `百度网盘${operation}失败：文件不存在或已删除`;
            break;
          case -6:
            message = `百度网盘${operation}失败：没有访问权限`;
            break;
          case -7:
            message = `百度网盘${operation}失败：文件名无效或已存在`;
            break;
          case 2:
            message = `百度网盘${operation}失败：参数错误`;
            break;
          case 10:
            message = `百度网盘${operation}失败：创建文件数量超限`;
            break;
          case 12:
            message = `百度网盘${operation}失败：高级认证过期，请重新授权`;
            break;
          case 36001:
            message = `百度网盘${operation}失败：没有使用该应用的权限`;
            break;
          default:
            message = `百度网盘${operation}失败：错误码 ${errno}`;
        }
      } else {
        message = `百度网盘${operation}失败：HTTP ${statusCode}`;
      }
    } catch {
      if (statusCode === 429) {
        message = `百度网盘${operation}失败：请求过于频繁，请稍后重试`;
      } else if (statusCode === 401) {
        message = `百度网盘${operation}失败：认证失败，请重新授权`;
      } else if (statusCode === 403) {
        message = `百度网盘${operation}失败：没有权限执行此操作`;
      } else {
        message = `百度网盘${operation}失败：HTTP ${statusCode} ${errorBody}`;
      }
    }

    throw new Error(message);
  }

  /**
   * Normalize a path to be absolute under the app directory.
   * Baidu PCS requires paths like /apps/{app_dir}/...
   */
  private normalizePath(path: string): string {
    // Remove leading/trailing slashes from the user-provided path
    const cleanPath = path.replace(/^\/+|\/+$/g, "");
    if (cleanPath.startsWith("apps/") || cleanPath.startsWith("/apps/")) {
      return `/${cleanPath}`;
    }
    return `${this.appDir}/${cleanPath}`;
  }

  // --- Baidu PCS API implementations ---

  /**
   * Get detailed information about a specific file.
   * Uses Baidu xpan file meta API: GET /rest/2.0/xpan/file?method=meta
   */
  async getFileInfo(path: string): Promise<FileInfo | null> {
    return this.withRateLimit(async () => {
      const normalizedPath = this.normalizePath(path);

      const url = `${BaiduDriver.API_BASE}/file?method=meta&path=${encodeURIComponent(normalizedPath)}`;
      const response = await this.apiRequest(url);

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        const errorText = await response.text();
        this.handleApiError("获取文件信息", response.status, errorText);
      }

      const data = await response.json() as BaiduListResponse;

      if (data.errno && data.errno !== 0) {
        // File not found
        if (data.errno === -1 || data.errno === 2) {
          return null;
        }
        throw new Error(`百度网盘获取文件信息失败：errno=${data.errno}`);
      }

      if (!data.list || data.list.length === 0) {
        return null;
      }

      const item = data.list[0];
      return {
        name: item.server_filename,
        size: item.size,
        isDir: item.isdir === 1,
        lastModified: new Date(item.mtime * 1000),
        created: new Date(item.ctime * 1000),
        id: String(item.fs_id),
        parentPath: normalizedPath.substring(0, normalizedPath.lastIndexOf("/")),
        md5: item.md5,
      };
    });
  }

  /**
   * List files in a directory on Baidu Wangpan.
   * Uses PCS API: GET /rest/2.0/xpan/file?method=list&dir={path}
   */
  async listDir(path: string): Promise<FileInfo[]> {
    return this.withRateLimit(async () => {
      const normalizedPath = this.normalizePath(path);
      const url = `${BaiduDriver.API_BASE}/file?method=list&dir=${encodeURIComponent(normalizedPath)}&folder=0&start=0&limit=1000`;

      const response = await this.apiRequest(url);
      if (!response.ok) {
        const errorText = await response.text();
        this.handleApiError("列出目录", response.status, errorText);
      }

      const data = await response.json() as BaiduListResponse;

      if (data.errno && data.errno !== 0) {
        // Directory not found
        if (data.errno === -1 || data.errno === 2) {
          throw new Error(`百度网盘列出目录失败：目录不存在（errno=${data.errno}）`);
        }
        throw new Error(`百度网盘列出目录失败：errno=${data.errno}`);
      }

      if (!data.list) {
        return [];
      }

      return data.list.map((item) => ({
        name: item.server_filename,
        size: item.size,
        isDir: item.isdir === 1,
        lastModified: new Date(item.mtime * 1000),
        created: new Date(item.ctime * 1000),
        id: String(item.fs_id),
        parentPath: normalizedPath,
        md5: item.md5,
      }));
    });
  }

  /**
   * Upload a file to Baidu Wangpan.
   * Small files (<256KB): single upload via PCS file API
   * Large files: precreate → upload parts → superfile2 merge
   */
  async writeFile(path: string, data: Buffer): Promise<void> {
    return this.withRateLimit(async () => {
      const normalizedPath = this.normalizePath(path);

      if (data.length < 256 * 1024) {
        // Small file: single upload
        await this.uploadSmallFile(normalizedPath, data);
      } else {
        // Large file: multipart upload
        await this.uploadLargeFile(normalizedPath, data);
      }
    });
  }

  /**
   * Upload a small file (<256KB) in a single request.
   */
  private async uploadSmallFile(path: string, data: Buffer): Promise<void> {
    const token = await this.ensureValidToken();
    const url = `${BaiduDriver.SMALL_FILE_UPLOAD_URL}?method=upload&path=${encodeURIComponent(path)}&ondup=overwrite&access_token=${token}`;

    const formData = new FormData();
    const blob = new Blob([data]);
    formData.append("file", blob, path.split("/").pop() || "file");

    const response = await fetch(url, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`百度网盘小文件上传失败：HTTP ${response.status} ${errorText}`);
    }

    const result = await response.json() as { errno?: number };
    if (result.errno && result.errno !== 0) {
      throw new Error(`百度网盘小文件上传失败：errno=${result.errno}`);
    }
  }

  /**
   * Upload a large file using precreate → upload parts → merge flow.
   */
  private async uploadLargeFile(path: string, data: Buffer): Promise<void> {
    const blockSize = 4 * 1024 * 1024; // 4MB per block
    const blockList: string[] = [];
    const totalBlocks = Math.ceil(data.length / blockSize);

    // Step 1: Precreate
    const precreateUrl = `${BaiduDriver.UPLOAD_URL}?method=precreate`;
    const precreateBody = {
      path,
      size: data.length,
      isdir: 0,
      autoinit: 1,
      block_list: Array.from({ length: totalBlocks }, (_, i) => i),
      ondup: "overwrite",
    };

    const precreateResponse = await this.apiRequest(precreateUrl, {
      method: "POST",
      body: JSON.stringify(precreateBody),
    });

    if (!precreateResponse.ok) {
      const errorText = await precreateResponse.text();
      this.handleApiError("预创建文件", precreateResponse.status, errorText);
    }

    const precreateData = await precreateResponse.json() as {
      uploadid: string;
      errno?: number;
      return_type?: number;
    };

    if (precreateData.errno && precreateData.errno !== 0) {
      throw new Error(`百度网盘预创建文件失败：errno=${precreateData.errno}`);
    }

    const uploadId = precreateData.uploadid;

    // Step 2: Upload each block
    const token = await this.ensureValidToken();
    for (let i = 0; i < totalBlocks; i++) {
      const start = i * blockSize;
      const end = Math.min(start + blockSize, data.length);
      const blockData = data.subarray(start, end);

      const blockMd5 = await this.calculateMD5(blockData);
      blockList.push(blockMd5);

      const uploadUrl = `${BaiduDriver.UPLOAD_URL}?method=upload&access_token=${token}&path=${encodeURIComponent(path)}&uploadid=${uploadId}&blockidx=${i}`;

      const formData = new FormData();
      const blob = new Blob([blockData]);
      formData.append("file", blob);

      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error(`百度网盘分片上传失败（分片 ${i}）：HTTP ${uploadResponse.status}`);
      }
    }

    // Step 3: Merge (create) the file
    const mergeUrl = `${BaiduDriver.UPLOAD_URL}?method=create`;
    const mergeBody = {
      path,
      size: data.length,
      isdir: 0,
      uploadid: uploadId,
      block_list: JSON.stringify(blockList),
      ondup: "overwrite",
    };

    const mergeResponse = await this.apiRequest(mergeUrl, {
      method: "POST",
      body: JSON.stringify(mergeBody),
    });

    if (!mergeResponse.ok) {
      const errorText = await mergeResponse.text();
      this.handleApiError("合并文件", mergeResponse.status, errorText);
    }
  }

  /**
   * Calculate MD5 hash of a buffer for block verification.
   * Baidu PCS API requires MD5 for block verification in superfile2 uploads.
   */
  private async calculateMD5(data: Buffer): Promise<string> {
    return crypto.createHash("md5").update(data).digest("hex");
  }

  /**
   * Download a file from Baidu Wangpan.
   * First gets the download link, then downloads the file content.
   */
  async readFile(path: string): Promise<Buffer> {
    return this.withRateLimit(async () => {
      const downloadUrl = await this.getDownloadLink(path);

      // Download the file using the dlink
      const downloadResponse = await fetch(downloadUrl, {
        headers: {
          "User-Agent": "netdisk",
        },
      });

      if (!downloadResponse.ok) {
        throw new Error(`百度网盘文件下载失败：HTTP ${downloadResponse.status}`);
      }

      const arrayBuffer = await downloadResponse.arrayBuffer();
      return Buffer.from(arrayBuffer);
    });
  }

  /**
   * Get the download link (dlink) for a file on Baidu Wangpan.
   * Returns the dlink URL with access token appended.
   */
  async getDownloadLink(path: string): Promise<string> {
    return this.withRateLimit(async () => {
      const normalizedPath = this.normalizePath(path);

      // Get download link via xpan multimedia API
      const dlinkUrl = `${BaiduDriver.API_BASE}/multimedia?method=dlink&path=${encodeURIComponent(normalizedPath)}`;
      const dlinkResponse = await this.apiRequest(dlinkUrl);

      if (!dlinkResponse.ok) {
        // Fallback to direct download URL
        const token = await this.ensureValidToken();
        const directUrl = `${BaiduDriver.DOWNLOAD_URL}?method=download&path=${encodeURIComponent(normalizedPath)}&access_token=${token}`;
        return directUrl;
      }

      const dlinkData = await dlinkResponse.json() as BaiduDlinkResponse;

      if (dlinkData.errno && dlinkData.errno !== 0) {
        throw new Error(`百度网盘获取下载链接失败：errno=${dlinkData.errno}`);
      }

      // The dlink can be in the top-level dlink field or inside list items
      let dlink: string | undefined;

      if (dlinkData.dlink) {
        dlink = dlinkData.dlink;
      } else if (dlinkData.list && dlinkData.list.length > 0 && dlinkData.list[0].dlink) {
        dlink = dlinkData.list[0].dlink;
      }

      if (!dlink) {
        throw new Error("百度网盘获取下载链接失败：未返回下载地址");
      }

      // Append access_token to the dlink URL as required by Baidu
      const token = await this.ensureValidToken();
      const separator = dlink.includes("?") ? "&" : "?";
      return `${dlink}${separator}access_token=${token}`;
    });
  }

  /**
   * Delete a file from Baidu Wangpan.
   * Uses filemanager API with opera=delete.
   */
  async deleteFile(path: string): Promise<void> {
    return this.withRateLimit(async () => {
      const normalizedPath = this.normalizePath(path);
      const url = `${BaiduDriver.API_BASE}/file?method=filemanager&opera=delete`;

      const body = `async=0&filelist=${encodeURIComponent(JSON.stringify([normalizedPath]))}`;
      const response = await this.apiRequest(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.handleApiError("删除文件", response.status, errorText);
      }

      const data = await response.json() as { errno?: number };
      if (data.errno && data.errno !== 0) {
        throw new Error(`百度网盘删除文件失败：errno=${data.errno}`);
      }
    });
  }

  async fileExists(path: string): Promise<boolean> {
    try {
      const info = await this.getFileInfo(path);
      return info !== null;
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
   * Create a directory on Baidu Wangpan.
   * Uses PCS API: POST /rest/2.0/xpan/file?method=create
   */
  async createDir(path: string): Promise<void> {
    return this.withRateLimit(async () => {
      const normalizedPath = this.normalizePath(path);
      const url = `${BaiduDriver.API_BASE}/file?method=create`;

      const body = `path=${encodeURIComponent(normalizedPath)}&isdir=1&size=0`;
      const response = await this.apiRequest(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.handleApiError("创建目录", response.status, errorText);
      }

      const data = await response.json() as { errno?: number };
      if (data.errno && data.errno !== 0) {
        throw new Error(`百度网盘创建目录失败：errno=${data.errno}`);
      }
    });
  }

  /**
   * Delete a directory from Baidu Wangpan.
   * Uses the same filemanager delete API.
   */
  async deleteDir(path: string): Promise<void> {
    return this.withRateLimit(async () => {
      const normalizedPath = this.normalizePath(path);
      const url = `${BaiduDriver.API_BASE}/file?method=filemanager&opera=delete`;

      const body = `async=0&filelist=${encodeURIComponent(JSON.stringify([normalizedPath]))}`;
      const response = await this.apiRequest(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.handleApiError("删除目录", response.status, errorText);
      }
    });
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
   * Get storage info from Baidu Wangpan.
   * Uses user info API and quota API.
   */
  async getStorageInfo(): Promise<{ used: number; total: number; available: number }> {
    return this.withRateLimit(async () => {
      const url = `${BaiduDriver.API_BASE}/user/info`;

      const response = await this.apiRequest(url);
      if (!response.ok) {
        throw new Error(`百度网盘获取存储信息失败：HTTP ${response.status}`);
      }

      const data = await response.json() as BaiduUserInfoResponse;

      // Baidu doesn't return storage quota directly via xpan/user/info
      // We need to use the older API
      const quotaUrl = "https://pan.baidu.com/api/quota";
      const quotaResponse = await this.apiRequest(quotaUrl);

      if (!quotaResponse.ok) {
        // Fallback: return default 2TB if quota API not accessible
        return { used: 0, total: 2199023255552, available: 2199023255552 };
      }

      const quotaData = await quotaResponse.json() as BaiduQuotaResponse;

      if (quotaData.errno && quotaData.errno !== 0) {
        return { used: 0, total: 2199023255552, available: 2199023255552 };
      }

      const used = quotaData.used || 0;
      const total = quotaData.total || 2199023255552;
      return { used, total, available: total - used };
    });
  }

  /**
   * Health check: actually calls the API to verify the token works.
   */
  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    try {
      const url = `${BaiduDriver.API_BASE}/user/info`;
      const response = await this.apiRequest(url);

      if (response.ok) {
        const data = await response.json() as BaiduUserInfoResponse;
        if (data.errno && data.errno !== 0) {
          return { healthy: false, message: `百度网盘连接异常：错误码 ${data.errno}` };
        }
        const userName = data.baidu_name || data.netdisk_name || "";
        return {
          healthy: true,
          message: userName ? `百度网盘已连接（用户：${userName}）` : "百度网盘已连接",
        };
      }

      if (response.status === 401 || response.status === 403) {
        return { healthy: false, message: "百度网盘授权已过期，请重新授权" };
      }

      return { healthy: false, message: `百度网盘连接异常：HTTP ${response.status}` };
    } catch (error) {
      return {
        healthy: false,
        message: `百度网盘健康检查失败：${error instanceof Error ? error.message : "未知错误"}`,
      };
    }
  }
}

export const baiduDriverFactory: StorageDriverFactory = {
  type: "baidu",
  displayName: "百度网盘",
  description: "连接到百度网盘，支持文件上传、下载和管理",
  authType: "oauth",
  configFields: [
    {
      key: "clientId",
      label: "Client ID (App Key)",
      type: "text",
      required: true,
      placeholder: "GyGxV3bWrAFn4WSy",
      helpText: "百度开放平台应用的 App Key",
    },
    {
      key: "clientSecret",
      label: "Client Secret (Secret Key)",
      type: "password",
      required: true,
      placeholder: "••••••••",
      helpText: "百度开放平台应用的 Secret Key",
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
      key: "appDir",
      label: "App Directory",
      type: "text",
      required: false,
      placeholder: "/apps/CloudDrive",
      helpText: "百度 PCS 应用的根目录路径",
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
  create: (config) => new BaiduDriver(config),
};
