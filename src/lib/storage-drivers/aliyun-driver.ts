import { CloudDriverBase } from "./cloud-driver-base";
import type {
  StorageDriverConfig,
  StorageDriverFactory,
  StorageDriverConfigField,
  OAuthConfig,
} from "./types";

/**
 * 阿里云盘 (Aliyun Drive) Driver
 * 
 * Uses Aliyun Drive Open Platform OAuth2 API.
 * API docs: https://www.alipan.com/open/
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

  constructor(config: StorageDriverConfig) {
    super(config);
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

  // --- Aliyun Drive-specific API stubs ---

  /**
   * List files in a directory on Aliyun Drive.
   * Uses Open API: /adrive/v1.0/openFile/list
   */
  async listDir(path: string): Promise<string[]> {
    return this.withRateLimit(async () => {
      // Stub: In production, call Aliyun Drive Open API
      // POST https://openapi.alipan.com/adrive/v1.0/openFile/list
      // Body: { drive_id, parent_file_id, ... }
      void path;
      return ["我的文档/", "我的图片/", "notes.txt"];
    });
  }

  /**
   * Upload a file to Aliyun Drive.
   * Uses two-phase upload: precreate → upload parts → complete
   */
  async writeFile(path: string, data: Buffer): Promise<void> {
    return this.withRateLimit(async () => {
      // Stub: In production, use Aliyun Drive upload flow
      // 1. POST /adrive/v1.0/openFile/create  (precreate)
      // 2. PUT upload URL for each part
      // 3. POST /adrive/v1.0/openFile/complete
      void path; void data;
    });
  }

  /**
   * Download a file from Aliyun Drive.
   * Uses Open API: /adrive/v1.0/openFile/getDownloadUrl
   */
  async readFile(path: string): Promise<Buffer> {
    return this.withRateLimit(async () => {
      // Stub: In production, get download URL then download
      // POST https://openapi.alipan.com/adrive/v1.0/openFile/getDownloadUrl
      void path;
      return Buffer.from("Mock Aliyun Drive file content");
    });
  }

  async deleteFile(path: string): Promise<void> {
    return this.withRateLimit(async () => {
      // Stub: POST /adrive/v1.0/openFile/recyclebin/trash
      void path;
    });
  }

  async fileExists(path: string): Promise<boolean> {
    return this.withRateLimit(async () => {
      // Stub: POST /adrive/v1.0/openFile/search
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
      // Stub: POST /adrive/v1.0/openFile/create with type="folder"
      void path;
    });
  }

  async deleteDir(path: string): Promise<void> {
    return this.withRateLimit(async () => {
      // Stub: POST /adrive/v1.0/openFile/recyclebin/trash
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
      // Stub: In production, call Aliyun Drive user info API
      // Aliyun Drive free tier: typically 100GB or more
      return { used: 0, total: 107374182400, available: 107374182400 }; // 100GB
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
