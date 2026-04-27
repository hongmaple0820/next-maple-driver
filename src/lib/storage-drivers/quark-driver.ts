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
 * After login, session cookies are used for subsequent API calls.
 *
 * Key concepts:
 * - Uses FID-based directory identification (each folder has a unique FID)
 * - Root directory has FID "0"
 * - File operations use FID to identify parent directory
 * - Cookies are required for all API calls
 * - API uses JSON request/response format with specific headers
 *
 * API endpoints are undocumented/reverse-engineered.
 */
export class QuarkDriver extends CookieAuthDriver {
  readonly type = "quark";

  // Quark API endpoints
  private static readonly API_BASE = "https://pan.quark.cn";

  private smsCode: string;
  private phone: string;

  // FID-based path cache
  private pathCache: Map<string, string> = new Map();

  constructor(config: StorageDriverConfig) {
    super(config);
    this.phone = config.config.phone || "";
    this.smsCode = config.config.smsCode || "";
    // Initialize cache with root
    this.pathCache.set("/", "0");
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
    const url = `${QuarkDriver.API_BASE}/account/login`;
    const body = JSON.stringify({
      phone: this.phone,
      password: this.password,
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      body,
      redirect: "manual",
    });

    if (!response.ok && response.status !== 302) {
      const errorText = await response.text();
      let errorMsg = `Quark login failed: ${response.status}`;
      try {
        const errData = JSON.parse(errorText) as { message?: string; msg?: string };
        errorMsg = errData.message || errData.msg || errorMsg;
      } catch {
        errorMsg = `${errorMsg} ${errorText}`;
      }
      throw new Error(errorMsg);
    }

    // Extract cookies from response headers
    const setCookieHeaders = response.headers.getSetCookie();
    if (setCookieHeaders && setCookieHeaders.length > 0) {
      const cookies = setCookieHeaders
        .map((header: string) => header.split(";")[0])
        .join("; ");
      this.cookies = cookies;
      return cookies;
    }

    // Try to extract from response body
    try {
      const data = await response.json() as {
        status?: number;
        data?: { cookie?: string };
        cookie?: string;
        message?: string;
      };

      if (data.cookie || data.data?.cookie) {
        this.cookies = data.cookie || data.data?.cookie || "";
        return this.cookies;
      }

      if (data.status !== 200 && data.status !== 0) {
        throw new Error(`Quark login failed: ${data.message || "unknown error"}`);
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes("Quark login failed")) {
        throw e;
      }
    }

    throw new Error("Quark login: no cookies returned");
  }

  /**
   * Login with phone number and SMS verification code.
   */
  private async loginWithSms(): Promise<string> {
    // Step 1: Request SMS code
    const smsUrl = `${QuarkDriver.API_BASE}/account/sms/send`;
    const smsBody = JSON.stringify({ phone: this.phone });

    const smsResponse = await fetch(smsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      body: smsBody,
    });

    if (!smsResponse.ok) {
      throw new Error(`Quark SMS request failed: ${smsResponse.status}`);
    }

    // Step 2: Verify SMS code and login
    const verifyUrl = `${QuarkDriver.API_BASE}/account/sms/verify`;
    const verifyBody = JSON.stringify({
      phone: this.phone,
      code: this.smsCode,
    });

    const verifyResponse = await fetch(verifyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      body: verifyBody,
      redirect: "manual",
    });

    if (!verifyResponse.ok && verifyResponse.status !== 302) {
      throw new Error(`Quark SMS verify failed: ${verifyResponse.status}`);
    }

    // Extract cookies
    const setCookieHeaders = verifyResponse.headers.getSetCookie();
    if (setCookieHeaders && setCookieHeaders.length > 0) {
      const cookies = setCookieHeaders
        .map((header: string) => header.split(";")[0])
        .join("; ");
      this.cookies = cookies;
      return cookies;
    }

    throw new Error("Quark SMS login: no cookies returned");
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

    try {
      const url = `${QuarkDriver.API_BASE}/account/sms/send`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        body: JSON.stringify({ phone: phoneNumber }),
      });

      if (!response.ok) {
        return { success: false, message: `发送验证码失败: ${response.status}` };
      }

      return { success: true, message: "验证码已发送" };
    } catch (e) {
      return { success: false, message: `发送验证码失败: ${e instanceof Error ? e.message : "未知错误"}` };
    }
  }

  /**
   * Validate that the current cookies are still valid.
   */
  async validateCookies(): Promise<boolean> {
    if (!this.cookies) return false;

    try {
      const url = `${QuarkDriver.API_BASE}/user/info`;
      const response = await this.cookieRequest(url);
      if (!response.ok) return false;

      const data = await response.json() as {
        status?: number;
        data?: { uid?: number };
      };

      return data.status === 200 || !!data.data?.uid;
    } catch {
      return false;
    }
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

  /**
   * Resolve a virtual path to a Quark FID.
   * Traverses the directory tree from root.
   */
  private async resolvePathToFid(path: string): Promise<string> {
    const normalizedPath = path.replace(/^\/+|\/+$/g, "") || "/";

    // Check cache first
    if (this.pathCache.has(normalizedPath)) {
      return this.pathCache.get(normalizedPath)!;
    }

    // Traverse from root
    const parts = normalizedPath.split("/").filter(Boolean);
    let currentFid = "0";

    for (let i = 0; i < parts.length; i++) {
      const partialPath = "/" + parts.slice(0, i + 1).join("/");

      // Check cache for this partial path
      if (this.pathCache.has(partialPath)) {
        currentFid = this.pathCache.get(partialPath)!;
        continue;
      }

      // List the current directory to find the child
      const files = await this.listDirByFid(currentFid);
      const found = files.find((f) => f.name === parts[i] && f.isDir);

      if (!found || !found.id) {
        throw new Error(`Quark resolvePath: path component "${parts[i]}" not found`);
      }

      currentFid = found.id;
      this.pathCache.set(partialPath, found.id);
    }

    return currentFid;
  }

  /**
   * List directory contents by FID.
   */
  private async listDirByFid(fid: string): Promise<FileInfo[]> {
    const url = `${QuarkDriver.API_BASE}/filelist?dir=${fid}&page=1&size=500`;

    const response = await this.cookieRequest(url);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Quark listDir failed: ${response.status} ${errorText}`);
    }

    const data = await response.json() as {
      status?: number;
      data?: {
        list?: Array<{
          fid?: string;
          file_name?: string;
          file_size?: number;
          dir?: boolean;
          file_type?: number;
          created_at?: number;
          updated_at?: number;
          md5?: string;
          sha1?: string;
        }>;
      };
      message?: string;
    };

    if (data.status !== 200) {
      throw new Error(`Quark listDir error: ${data.message || "unknown error"}`);
    }

    if (!data.data?.list) {
      return [];
    }

    return data.data.list.map((item) => ({
      name: item.file_name || "unknown",
      size: item.file_size || 0,
      isDir: item.dir || false,
      lastModified: item.updated_at ? new Date(item.updated_at * 1000) : undefined,
      created: item.created_at ? new Date(item.created_at * 1000) : undefined,
      id: item.fid || "",
      parentPath: fid === "0" ? "/" : fid,
      md5: item.md5 || item.sha1,
    }));
  }

  /**
   * Get parent FID and name from a path.
   */
  private async getParentFidAndName(path: string): Promise<{ parentFid: string; name: string }> {
    const normalizedPath = path.replace(/^\/+|\/+$/g, "");
    const lastSlash = normalizedPath.lastIndexOf("/");
    const name = normalizedPath.substring(lastSlash + 1);
    const parentPath = normalizedPath.substring(0, lastSlash) || "/";

    const parentFid = await this.resolvePathToFid(parentPath);
    return { parentFid, name };
  }

  // --- Quark Drive API implementations ---

  /**
   * List files in a directory on Quark Drive.
   */
  async listDir(path: string): Promise<FileInfo[]> {
    return this.withRateLimit(async () => {
      const fid = await this.resolvePathToFid(path);
      return this.listDirByFid(fid);
    });
  }

  /**
   * Upload a file to Quark Drive.
   * Uses Quark upload API with pre-check.
   */
  async writeFile(path: string, data: Buffer): Promise<void> {
    return this.withRateLimit(async () => {
      const { parentFid, name } = await this.getParentFidAndName(path);

      // Step 1: Pre-create the upload
      const preCreateUrl = `${QuarkDriver.API_BASE}/file/upload/precreate`;
      const preCreateBody = JSON.stringify({
        dir: parentFid,
        file_name: name,
        file_size: data.length,
      });

      const preCreateResponse = await this.cookieRequest(preCreateUrl, {
        method: "POST",
        body: preCreateBody,
      });

      if (!preCreateResponse.ok) {
        const errorText = await preCreateResponse.text();
        throw new Error(`Quark precreate failed: ${preCreateResponse.status} ${errorText}`);
      }

      const preCreateData = await preCreateResponse.json() as {
        status?: number;
        data?: {
          task_id?: string;
          upload_url?: string;
          fid?: string;
        };
        message?: string;
      };

      if (preCreateData.status !== 200) {
        throw new Error(`Quark precreate error: ${preCreateData.message || "unknown error"}`);
      }

      // If fid is returned, file already exists (dedup)
      if (preCreateData.data?.fid) {
        return;
      }

      // Step 2: Upload the file data
      if (preCreateData.data?.upload_url) {
        const uploadResponse = await fetch(preCreateData.data.upload_url, {
          method: "PUT",
          body: data,
          headers: {
            "Content-Type": "application/octet-stream",
          },
        });

        if (!uploadResponse.ok) {
          throw new Error(`Quark file upload failed: ${uploadResponse.status}`);
        }
      }

      // Step 3: Complete the upload
      if (preCreateData.data?.task_id) {
        const completeUrl = `${QuarkDriver.API_BASE}/file/upload/complete`;
        const completeBody = JSON.stringify({
          task_id: preCreateData.data.task_id,
          dir: parentFid,
          file_name: name,
        });

        const completeResponse = await this.cookieRequest(completeUrl, {
          method: "POST",
          body: completeBody,
        });

        if (!completeResponse.ok) {
          const errorText = await completeResponse.text();
          throw new Error(`Quark complete upload failed: ${completeResponse.status} ${errorText}`);
        }
      }

      // Invalidate cache for this path
      const normalizedPath = path.replace(/^\/+|\/+$/g, "");
      this.pathCache.delete(normalizedPath);
    });
  }

  /**
   * Download a file from Quark Drive.
   * First gets the download URL, then downloads the file content.
   */
  async readFile(path: string): Promise<Buffer> {
    return this.withRateLimit(async () => {
      const normalizedPath = path.replace(/^\/+|\/+$/g, "");
      const lastSlash = normalizedPath.lastIndexOf("/");
      const parentPath = normalizedPath.substring(0, lastSlash) || "/";
      const fileName = normalizedPath.substring(lastSlash + 1);

      // Find the file in the parent directory
      const files = await this.listDir(parentPath);
      const file = files.find((f) => f.name === fileName && !f.isDir);

      if (!file || !file.id) {
        throw new Error(`Quark readFile: file "${fileName}" not found`);
      }

      // Get download URL
      const downloadUrl = `${QuarkDriver.API_BASE}/file/download`;
      const downloadBody = JSON.stringify({
        fid: file.id,
      });

      const downloadResponse = await this.cookieRequest(downloadUrl, {
        method: "POST",
        body: downloadBody,
      });

      if (!downloadResponse.ok) {
        const errorText = await downloadResponse.text();
        throw new Error(`Quark getDownloadUrl failed: ${downloadResponse.status} ${errorText}`);
      }

      const downloadData = await downloadResponse.json() as {
        status?: number;
        data?: {
          download_url?: string;
          url?: string;
        };
        message?: string;
      };

      const fileUrl = downloadData.data?.download_url || downloadData.data?.url;
      if (!fileUrl) {
        throw new Error("Quark readFile: no download URL returned");
      }

      // Download the file content
      const fileResponse = await fetch(fileUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Cookie: this.cookies,
        },
      });

      if (!fileResponse.ok) {
        throw new Error(`Quark file download failed: ${fileResponse.status}`);
      }

      const arrayBuffer = await fileResponse.arrayBuffer();
      return Buffer.from(arrayBuffer);
    });
  }

  /**
   * Delete a file from Quark Drive.
   */
  async deleteFile(path: string): Promise<void> {
    return this.withRateLimit(async () => {
      const normalizedPath = path.replace(/^\/+|\/+$/g, "");
      const lastSlash = normalizedPath.lastIndexOf("/");
      const parentPath = normalizedPath.substring(0, lastSlash) || "/";
      const fileName = normalizedPath.substring(lastSlash + 1);

      // Find the file
      const files = await this.listDir(parentPath);
      const file = files.find((f) => f.name === fileName);

      if (!file || !file.id) {
        throw new Error(`Quark deleteFile: file "${fileName}" not found`);
      }

      const url = `${QuarkDriver.API_BASE}/file/delete`;
      const body = JSON.stringify({
        fid: file.id,
      });

      const response = await this.cookieRequest(url, {
        method: "POST",
        body,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Quark deleteFile failed: ${response.status} ${errorText}`);
      }

      // Invalidate cache
      this.pathCache.delete(normalizedPath);
    });
  }

  async fileExists(path: string): Promise<boolean> {
    try {
      const normalizedPath = path.replace(/^\/+|\/+$/g, "");
      const lastSlash = normalizedPath.lastIndexOf("/");
      const parentPath = normalizedPath.substring(0, lastSlash) || "/";
      const fileName = normalizedPath.substring(lastSlash + 1);

      const files = await this.listDir(parentPath);
      return files.some((f) => f.name === fileName);
    } catch {
      return false;
    }
  }

  async getFileSize(path: string): Promise<number> {
    const normalizedPath = path.replace(/^\/+|\/+$/g, "");
    const lastSlash = normalizedPath.lastIndexOf("/");
    const parentPath = normalizedPath.substring(0, lastSlash) || "/";
    const fileName = normalizedPath.substring(lastSlash + 1);

    const files = await this.listDir(parentPath);
    const file = files.find((f) => f.name === fileName);
    return file?.size || 0;
  }

  /**
   * Create a directory on Quark Drive.
   */
  async createDir(path: string): Promise<void> {
    return this.withRateLimit(async () => {
      const { parentFid, name } = await this.getParentFidAndName(path);

      const url = `${QuarkDriver.API_BASE}/file/create_dir`;
      const body = JSON.stringify({
        dir: parentFid,
        file_name: name,
      });

      const response = await this.cookieRequest(url, {
        method: "POST",
        body,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Quark createDir failed: ${response.status} ${errorText}`);
      }

      const data = await response.json() as {
        status?: number;
        data?: { fid?: string };
        message?: string;
      };

      if (data.status !== 200) {
        throw new Error(`Quark createDir error: ${data.message || "unknown error"}`);
      }

      // Cache the new FID
      if (data.data?.fid) {
        const normalizedPath = path.replace(/^\/+|\/+$/g, "");
        this.pathCache.set(normalizedPath, data.data.fid);
      }
    });
  }

  /**
   * Delete a directory from Quark Drive.
   */
  async deleteDir(path: string): Promise<void> {
    return this.deleteFile(path);
  }

  async dirExists(path: string): Promise<boolean> {
    try {
      const normalizedPath = path.replace(/^\/+|\/+$/g, "");
      const lastSlash = normalizedPath.lastIndexOf("/");
      const parentPath = normalizedPath.substring(0, lastSlash) || "/";
      const dirName = normalizedPath.substring(lastSlash + 1);

      const files = await this.listDir(parentPath);
      return files.some((f) => f.name === dirName && f.isDir);
    } catch {
      return false;
    }
  }

  /**
   * Get storage info from Quark Drive.
   */
  async getStorageInfo(): Promise<{ used: number; total: number; available: number }> {
    return this.withRateLimit(async () => {
      const url = `${QuarkDriver.API_BASE}/user/info`;

      const response = await this.cookieRequest(url);
      if (!response.ok) {
        throw new Error(`Quark getStorageInfo failed: ${response.status}`);
      }

      const data = await response.json() as {
        data?: {
          used_size?: number;
          total_size?: number;
          space_used?: number;
          space_total?: number;
        };
      };

      const used = data.data?.used_size || data.data?.space_used || 0;
      const total = data.data?.total_size || data.data?.space_total || 10737418240;
      return { used, total, available: total - used };
    });
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    const authStatus = this.getAuthStatus();
    if (authStatus === "authorized") {
      // Validate cookies are still good
      const valid = await this.validateCookies();
      if (valid) {
        return { healthy: true, message: "夸克网盘已连接" };
      }
      return { healthy: false, message: "夸克网盘登录已过期，请重新登录" };
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
