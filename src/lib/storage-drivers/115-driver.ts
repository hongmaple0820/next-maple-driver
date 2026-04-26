import { CookieAuthDriver } from "./cloud-driver-base";
import type {
  StorageDriverConfig,
  StorageDriverFactory,
  StorageDriverConfigField,
  FileInfo,
} from "./types";

/**
 * 115网盘 (115 Wangpan) Driver
 * 
 * Uses cookie-based authentication (no official OAuth).
 * Authentication is done via account/password login, which returns
 * session cookies that are used for subsequent API calls.
 * 
 * API is undocumented/reverse-engineered. This driver provides
 * a proper architecture but with stub implementations.
 */
export class Drive115Driver extends CookieAuthDriver {
  readonly type = "115";

  // 115 API endpoints
  private static readonly API_BASE = "https://webapi.115.com";
  private static readonly PROXY_URL = "https://proapi.115.com";

  constructor(config: StorageDriverConfig) {
    super(config);
  }

  /**
   * Login to 115 Wangpan with username/password.
   * Returns session cookies.
   */
  async login(): Promise<string> {
    // Stub: In production, POST to https://webapi.115.com/user/login
    // with username and password, extract cookies from response
    return `mock_115_cookies_${Date.now()}`;
  }

  /**
   * Validate that the current cookies are still valid.
   */
  async validateCookies(): Promise<boolean> {
    // Stub: In production, GET https://webapi.115.com/user/check
    if (!this.cookies) return false;
    return true;
  }

  protected getMaxConcurrent(): number {
    return 2; // 115 has very strict rate limits
  }

  protected getMinInterval(): number {
    return 500; // 500ms between calls
  }

  // --- 115-specific API stubs ---

  async listDir(path: string): Promise<FileInfo[]> {
    return this.withRateLimit(async () => {
      // Stub: In production, GET https://webapi.115.com/files/filelist
      void path;
      return [];
    });
  }

  async writeFile(path: string, data: Buffer): Promise<void> {
    return this.withRateLimit(async () => {
      // Stub: In production, upload via 115 upload API
      // Uses SHA1 for deduplication check first
      void path; void data;
    });
  }

  async readFile(path: string): Promise<Buffer> {
    return this.withRateLimit(async () => {
      // Stub: In production, get download URL then download
      // GET https://webapi.115.com/files/download
      void path;
      return Buffer.from("Mock 115 Wangpan file content");
    });
  }

  async deleteFile(path: string): Promise<void> {
    return this.withRateLimit(async () => {
      // Stub: POST https://webapi.115.com/files/delete
      void path;
    });
  }

  async fileExists(path: string): Promise<boolean> {
    return this.withRateLimit(async () => {
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
      // Stub: POST https://webapi.115.com/files/add
      void path;
    });
  }

  async deleteDir(path: string): Promise<void> {
    return this.withRateLimit(async () => {
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
      // Stub: In production, call user info API
      // 115 typically offers various storage tiers
      return { used: 0, total: 0, available: 0 }; // Unknown without API access
    });
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    const authStatus = this.getAuthStatus();
    if (authStatus === "authorized") {
      return { healthy: true, message: "115网盘已连接" };
    }
    if (authStatus === "pending") {
      return { healthy: false, message: "115网盘需要登录" };
    }
    return { healthy: false, message: "115网盘连接异常" };
  }
}

export const drive115DriverFactory: StorageDriverFactory = {
  type: "115",
  displayName: "115网盘",
  description: "连接到115网盘，支持文件上传、下载和管理（需要账号密码登录）",
  authType: "password",
  configFields: [
    {
      key: "username",
      label: "账号",
      type: "text",
      required: true,
      placeholder: "手机号或邮箱",
      helpText: "115网盘登录账号",
    },
    {
      key: "password",
      label: "密码",
      type: "password",
      required: true,
      placeholder: "••••••••",
      helpText: "115网盘登录密码",
    },
    {
      key: "cookies",
      label: "Cookies（可选）",
      type: "password",
      required: false,
      placeholder: "已有的登录 cookies",
      helpText: "如已有 cookies 可直接填入，避免重复登录",
    },
  ],
  create: (config) => new Drive115Driver(config),
};
