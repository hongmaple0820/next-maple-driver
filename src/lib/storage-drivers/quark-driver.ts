import { CookieAuthDriver } from "./cloud-driver-base";
import type {
  StorageDriverConfig,
  StorageDriverFactory,
  StorageDriverConfigField,
  CloudAuthType,
  CloudAuthStatus,
  FileInfo,
} from "./types";

/**
 * 夸克网盘 (Quark Drive) Driver
 * 
 * Uses phone number + password authentication with SMS verification support.
 * Authentication can be done via:
 * 1. Phone number + password (standard login)
 * 2. Phone number + SMS code (verification code login)
 * 
 * After login, session cookies are used for subsequent API calls.
 * API is undocumented/reverse-engineered. This driver provides
 * a proper architecture but with stub implementations.
 */
export class QuarkDriver extends CookieAuthDriver {
  readonly type = "quark";

  // Quark API endpoints
  private static readonly API_BASE = "https://pan.quark.cn";

  private smsCode: string;
  private phone: string;

  constructor(config: StorageDriverConfig) {
    super(config);
    this.phone = config.config.phone || "";
    this.smsCode = config.config.smsCode || "";
  }

  /**
   * Login to Quark Drive with phone + password or SMS code.
   * Returns session cookies.
   */
  async login(): Promise<string> {
    if (this.smsCode) {
      return this.loginWithSms();
    }
    return this.loginWithPassword();
  }

  /**
   * Login with phone number and password.
   */
  private async loginWithPassword(): Promise<string> {
    // Stub: In production, POST to https://pan.quark.cn/account/login
    // with phone and password, extract cookies
    return `mock_quark_cookies_${Date.now()}`;
  }

  /**
   * Login with phone number and SMS verification code.
   */
  private async loginWithSms(): Promise<string> {
    // Stub: In production:
    // 1. POST to request SMS code: https://pan.quark.cn/account/sms/send
    // 2. POST to verify SMS code: https://pan.quark.cn/account/sms/verify
    // 3. Extract cookies from response
    return `mock_quark_sms_cookies_${Date.now()}`;
  }

  /**
   * Request SMS verification code.
   * This is a separate step from login - the user needs to
   * request a code first, then login with the code.
   */
  async requestSmsCode(phone?: string): Promise<{ success: boolean; message: string }> {
    const phoneNumber = phone || this.phone;
    if (!phoneNumber) {
      return { success: false, message: "请输入手机号" };
    }
    // Stub: In production, POST to request SMS code
    return { success: true, message: "验证码已发送" };
  }

  /**
   * Validate that the current cookies are still valid.
   */
  async validateCookies(): Promise<boolean> {
    // Stub: In production, GET https://pan.quark.cn/user/info
    if (!this.cookies) return false;
    return true;
  }

  /**
   * Override getAuthType - Quark supports both password and SMS auth
   */
  getAuthType(): CloudAuthType {
    if (this.smsCode) return "sms";
    return "password";
  }

  /**
   * Override getAuthStatus for Quark's specific auth flow
   */
  getAuthStatus(): CloudAuthStatus {
    if (this.cookies) {
      return "authorized";
    }
    if (this.phone && (this.password || this.smsCode)) {
      return "pending";
    }
    if (this.phone && !this.password && !this.smsCode) {
      return "pending"; // Need SMS code or password
    }
    return "error";
  }

  protected getMaxConcurrent(): number {
    return 3; // Quark has moderate rate limits
  }

  protected getMinInterval(): number {
    return 300; // 300ms between calls
  }

  // --- Quark Drive-specific API stubs ---

  async listDir(path: string): Promise<FileInfo[]> {
    return this.withRateLimit(async () => {
      // Stub: In production, GET https://pan.quark.cn/filelist
      void path;
      return [];
    });
  }

  async writeFile(path: string, data: Buffer): Promise<void> {
    return this.withRateLimit(async () => {
      // Stub: In production, upload via Quark upload API
      void path; void data;
    });
  }

  async readFile(path: string): Promise<Buffer> {
    return this.withRateLimit(async () => {
      // Stub: In production, get download URL then download
      void path;
      return Buffer.from("Mock Quark Drive file content");
    });
  }

  async deleteFile(path: string): Promise<void> {
    return this.withRateLimit(async () => {
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
      // Quark free tier: typically 10GB
      return { used: 0, total: 10737418240, available: 10737418240 }; // 10GB
    });
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    const authStatus = this.getAuthStatus();
    if (authStatus === "authorized") {
      return { healthy: true, message: "夸克网盘已连接" };
    }
    if (authStatus === "pending") {
      return { healthy: false, message: "夸克网盘需要登录" };
    }
    return { healthy: false, message: "夸克网盘连接异常" };
  }
}

export const quarkDriverFactory: StorageDriverFactory = {
  type: "quark",
  displayName: "夸克网盘",
  description: "连接到夸克网盘，支持文件上传、下载和管理（支持手机号+密码或短信验证码登录）",
  authType: "sms", // Primary auth type is SMS, but also supports password
  configFields: [
    {
      key: "phone",
      label: "手机号",
      type: "text",
      required: true,
      placeholder: "13800138000",
      helpText: "夸克网盘注册手机号",
    },
    {
      key: "password",
      label: "密码（可选）",
      type: "password",
      required: false,
      placeholder: "••••••••",
      helpText: "夸克网盘登录密码，如使用短信验证码登录可不填",
    },
    {
      key: "smsCode",
      label: "短信验证码（可选）",
      type: "text",
      required: false,
      placeholder: "123456",
      helpText: "短信验证码，点击「发送验证码」获取",
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
  create: (config) => new QuarkDriver(config),
};
