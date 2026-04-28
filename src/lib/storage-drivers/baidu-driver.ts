import crypto from "crypto";
import { CloudDriverBase } from "./cloud-driver-base";
import type {
  StorageDriverConfig,
  StorageDriverFactory,
  StorageDriverConfigField,
  OAuthConfig,
  FileInfo,
} from "./types";

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
        throw new Error(`Baidu listDir failed: ${response.status} ${errorText}`);
      }

      const data = await response.json() as {
        list?: Array<{
          fs_id: number;
          path: string;
          server_filename: string;
          size: number;
          isdir: number;
          mtime: number;
          ctime: number;
          md5?: string;
        }>;
        errno?: number;
      };

      if (data.errno && data.errno !== 0) {
        throw new Error(`Baidu listDir error: errno=${data.errno}`);
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
    const url = `${BaiduDriver.SMALL_FILE_UPLOAD_URL}?method=upload&path=${encodeURIComponent(path)}&ondup=overwrite`;

    const formData = new FormData();
    const blob = new Blob([data]);
    formData.append("file", blob, path.split("/").pop() || "file");

    const token = await this.ensureValidToken();
    const response = await fetch(`${url}&access_token=${token}`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Baidu small file upload failed: ${response.status} ${errorText}`);
    }

    const result = await response.json() as { errno?: number };
    if (result.errno && result.errno !== 0) {
      throw new Error(`Baidu small file upload error: errno=${result.errno}`);
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
      throw new Error(`Baidu precreate failed: ${precreateResponse.status} ${errorText}`);
    }

    const precreateData = await precreateResponse.json() as {
      uploadid: string;
      errno?: number;
      return_type?: number;
    };

    if (precreateData.errno && precreateData.errno !== 0) {
      throw new Error(`Baidu precreate error: errno=${precreateData.errno}`);
    }

    const uploadId = precreateData.uploadid;

    // Step 2: Upload each block
    for (let i = 0; i < totalBlocks; i++) {
      const start = i * blockSize;
      const end = Math.min(start + blockSize, data.length);
      const blockData = data.subarray(start, end);

      const blockMd5 = await this.calculateMD5(blockData);
      blockList.push(blockMd5);

      const uploadUrl = `${BaiduDriver.UPLOAD_URL}?method=upload&access_token=${this.accessToken}&path=${encodeURIComponent(path)}&uploadid=${uploadId}&blockidx=${i}`;

      const formData = new FormData();
      const blob = new Blob([blockData]);
      formData.append("file", blob);

      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error(`Baidu block upload failed at index ${i}: ${uploadResponse.status}`);
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
      throw new Error(`Baidu merge failed: ${mergeResponse.status} ${errorText}`);
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
        throw new Error(`Baidu file download failed: ${downloadResponse.status}`);
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

      // Get download link
      const dlinkUrl = `${BaiduDriver.API_BASE}/multimedia?method=dlink&path=${encodeURIComponent(normalizedPath)}`;
      const dlinkResponse = await this.apiRequest(dlinkUrl);

      if (!dlinkResponse.ok) {
        // Fallback to direct download URL
        const directUrl = `${BaiduDriver.DOWNLOAD_URL}?method=download&path=${encodeURIComponent(normalizedPath)}&access_token=${this.accessToken}`;
        return directUrl;
      }

      const dlinkData = await dlinkResponse.json() as {
        dlink?: string;
        errno?: number;
      };

      if (dlinkData.errno && dlinkData.errno !== 0) {
        throw new Error(`Baidu getDownloadLink error: errno=${dlinkData.errno}`);
      }

      if (!dlinkData.dlink) {
        throw new Error("Baidu getDownloadLink: no download link returned");
      }

      // Return the dlink with access token
      return `${dlinkData.dlink}&access_token=${this.accessToken}`;
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
        throw new Error(`Baidu deleteFile failed: ${response.status} ${errorText}`);
      }

      const data = await response.json() as { errno?: number };
      if (data.errno && data.errno !== 0) {
        throw new Error(`Baidu deleteFile error: errno=${data.errno}`);
      }
    });
  }

  async fileExists(path: string): Promise<boolean> {
    return this.withRateLimit(async () => {
      const normalizedPath = this.normalizePath(path);
      const parentPath = normalizedPath.substring(0, normalizedPath.lastIndexOf("/"));
      const fileName = normalizedPath.substring(normalizedPath.lastIndexOf("/") + 1);

      try {
        const files = await this.listDir(parentPath.replace(this.appDir, "") || "/");
        return files.some((f) => f.name === fileName);
      } catch {
        return false;
      }
    });
  }

  async getFileSize(path: string): Promise<number> {
    return this.withRateLimit(async () => {
      const normalizedPath = this.normalizePath(path);
      const url = `${BaiduDriver.API_BASE}/multimedia?method=list&path=${encodeURIComponent(normalizedPath)}`;

      const response = await this.apiRequest(url);
      if (!response.ok) {
        throw new Error(`Baidu getFileSize failed: ${response.status}`);
      }

      const data = await response.json() as {
        list?: Array<{ size: number }>;
        errno?: number;
      };

      if (data.list && data.list.length > 0) {
        return data.list[0].size;
      }
      return 0;
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
        throw new Error(`Baidu createDir failed: ${response.status} ${errorText}`);
      }

      const data = await response.json() as { errno?: number };
      if (data.errno && data.errno !== 0) {
        throw new Error(`Baidu createDir error: errno=${data.errno}`);
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
        throw new Error(`Baidu deleteDir failed: ${response.status} ${errorText}`);
      }
    });
  }

  async dirExists(path: string): Promise<boolean> {
    return this.withRateLimit(async () => {
      const normalizedPath = this.normalizePath(path);
      const parentPath = normalizedPath.substring(0, normalizedPath.lastIndexOf("/"));
      const dirName = normalizedPath.substring(normalizedPath.lastIndexOf("/") + 1);

      try {
        const files = await this.listDir(parentPath.replace(this.appDir, "") || "/");
        return files.some((f) => f.name === dirName && f.isDir);
      } catch {
        return false;
      }
    });
  }

  /**
   * Get storage info from Baidu Wangpan.
   * Uses user info API.
   */
  async getStorageInfo(): Promise<{ used: number; total: number; available: number }> {
    return this.withRateLimit(async () => {
      const url = `${BaiduDriver.API_BASE}/user/info`;

      const response = await this.apiRequest(url);
      if (!response.ok) {
        throw new Error(`Baidu getStorageInfo failed: ${response.status}`);
      }

      const data = await response.json() as {
        baidu_name?: string;
        uk?: number;
        vip_type?: number;
        vip?: number;
        errno?: number;
      };

      // Baidu doesn't return storage quota directly via xpan/user/info
      // We need to use the older API
      const quotaUrl = "https://pan.baidu.com/api/quota";
      const quotaResponse = await this.apiRequest(quotaUrl);

      if (!quotaResponse.ok) {
        // Fallback: return default 2TB if quota API not accessible
        return { used: 0, total: 2199023255552, available: 2199023255552 };
      }

      const quotaData = await quotaResponse.json() as {
        used?: number;
        total?: number;
        errno?: number;
      };

      if (quotaData.errno && quotaData.errno !== 0) {
        return { used: 0, total: 2199023255552, available: 2199023255552 };
      }

      const used = quotaData.used || 0;
      const total = quotaData.total || 2199023255552;
      return { used, total, available: total - used };
    });
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    const authStatus = this.getAuthStatus();
    if (authStatus === "authorized") {
      return { healthy: true, message: "百度网盘已连接" };
    }
    if (authStatus === "expired") {
      return { healthy: false, message: "百度网盘授权已过期，请重新授权" };
    }
    return { healthy: false, message: "百度网盘需要授权" };
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
      helpText: "如已有 refresh token 可直接填入，否则通过 OAuth 授权获取",
    },
  ],
  create: (config) => new BaiduDriver(config),
};
