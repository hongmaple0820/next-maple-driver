import { CloudDriverBase } from "./cloud-driver-base";
import type {
  StorageDriverConfig,
  StorageDriverFactory,
  StorageDriverConfigField,
  OAuthConfig,
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
 */
export class BaiduDriver extends CloudDriverBase {
  readonly type = "baidu";

  // Baidu PCS API endpoints
  private static readonly API_BASE = "https://pan.baidu.com/rest/2.0/xpan";
  private static readonly UPLOAD_URL = "https://d.pcs.baidu.com/rest/2.0/pcs/superfile2";
  private static readonly DOWNLOAD_URL = "https://d.pcs.baidu.com/rest/2.0/pcs/file";

  constructor(config: StorageDriverConfig) {
    super(config);
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

  // --- Baidu-specific API stubs ---

  /**
   * List files in a directory on Baidu Wangpan.
   * Uses PCS API: /rest/2.0/xpan/file?method=list
   */
  async listDir(path: string): Promise<string[]> {
    return this.withRateLimit(async () => {
      // Stub: In production, call Baidu PCS API
      // GET https://pan.baidu.com/rest/2.0/xpan/file?method=list&dir={path}&access_token={token}
      void path;
      return ["Documents/", "Photos/", "readme.txt"];
    });
  }

  /**
   * Upload a file to Baidu Wangpan.
   * Uses PCS superfile2 API for large file support (multipart upload).
   */
  async writeFile(path: string, data: Buffer): Promise<void> {
    return this.withRateLimit(async () => {
      // Stub: In production, upload via Baidu PCS API
      // POST https://d.pcs.baidu.com/rest/2.0/pcs/superfile2?method=precreate
      // Then upload blocks, then merge
      void path; void data;
    });
  }

  /**
   * Download a file from Baidu Wangpan.
   * Uses PCS file download API.
   */
  async readFile(path: string): Promise<Buffer> {
    return this.withRateLimit(async () => {
      // Stub: In production, download via Baidu PCS API
      // GET https://d.pcs.baidu.com/rest/2.0/pcs/file?method=download&path={path}&access_token={token}
      void path;
      return Buffer.from("Mock Baidu Wangpan file content");
    });
  }

  async deleteFile(path: string): Promise<void> {
    return this.withRateLimit(async () => {
      // Stub: POST /rest/2.0/xpan/file?method=filemanager&opera=delete
      void path;
    });
  }

  async fileExists(path: string): Promise<boolean> {
    return this.withRateLimit(async () => {
      // Stub: GET /rest/2.0/xpan/multimedia?method=search
      void path;
      return false;
    });
  }

  async getFileSize(path: string): Promise<number> {
    return this.withRateLimit(async () => {
      void path;
      return 0;
    });
  }

  async createDir(path: string): Promise<void> {
    return this.withRateLimit(async () => {
      // Stub: POST /rest/2.0/xpan/file?method=create&path={path}&isdir=1
      void path;
    });
  }

  async deleteDir(path: string): Promise<void> {
    return this.withRateLimit(async () => {
      // Stub: POST /rest/2.0/xpan/file?method=filemanager&opera=delete
      void path;
    });
  }

  async dirExists(path: string): Promise<boolean> {
    return this.withRateLimit(async () => {
      void path;
      return false;
    });
  }

  async getStorageInfo(): Promise<{ used: number; total: number; available: number }> {
    return this.withRateLimit(async () => {
      // Stub: In production, call Baidu user info API
      // Baidu free tier: 2TB (2048GB)
      return { used: 0, total: 2199023255552, available: 2199023255552 }; // 2TB
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
