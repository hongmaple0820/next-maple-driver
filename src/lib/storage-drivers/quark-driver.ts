import { CookieAuthDriver } from "./cloud-driver-base";
import type {
  StorageDriverConfig,
  StorageDriverFactory,
  StorageDriverConfigField,
  CloudAuthStatus,
  FileInfo,
} from "./types";

/**
 * Quark Drive (夸克网盘) Driver
 *
 * Uses cookie-based authentication. There is no public login API.
 * Users must either:
 *   1. Manually provide cookies from their browser session, or
 *   2. Use QR code scanning (scanning with the Quark mobile app)
 *
 * Key concepts:
 * - Uses FID-based directory identification (each folder has a unique FID)
 * - Root directory has FID "0"
 * - File operations use FID to identify parent directory
 * - Cookies are required for all API calls
 * - API uses JSON request/response format with specific headers
 *
 * API endpoints are undocumented/reverse-engineered based on AList.
 */
export class QuarkDriver extends CookieAuthDriver {
  readonly type = "quark";

  // Quark API endpoints
  private static readonly API_BASE = "https://pan.quark.cn";

  // Standard browser headers for Quark requests
  private static readonly DEFAULT_HEADERS: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Referer: "https://pan.quark.cn/",
    Origin: "https://pan.quark.cn",
  };

  // FID-based path cache
  private pathCache: Map<string, string> = new Map();

  constructor(config: StorageDriverConfig) {
    super(config);
    // Initialize cache with root
    this.pathCache.set("/", "0");
  }

  /**
   * Login to Quark Drive.
   * Since Quark has no public login API, this method:
   * - If cookies are already provided, validates them
   * - If no cookies, throws an error instructing the user to provide cookies
   *   or use QR code scanning
   */
  async login(): Promise<string> {
    if (this.cookies) {
      // Validate existing cookies
      const valid = await this.validateCookies();
      if (valid) {
        return this.cookies;
      }
      // Cookies are invalid/expired - clear them
      this.cookies = "";
    }

    throw new Error(
      "夸克网盘没有公开的登录 API。请通过以下方式之一提供认证信息：\n" +
        "1. 在配置中手动填入浏览器中获取的 Cookie\n" +
        "2. 使用二维码扫描登录（通过 /api/drivers/[id]/qr-login 接口）"
    );
  }

  /**
   * Request a QR code for login via the Quark mobile app.
   * Returns the QR code token and image URL for the user to scan.
   */
  async requestQrCode(): Promise<{
    token: string;
    imageUrl: string;
    qrcodeUrl: string;
  }> {
    const url = `${QuarkDriver.API_BASE}/account/qrcode`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        ...QuarkDriver.DEFAULT_HEADERS,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Quark QR code request failed: ${response.status} ${errorText}`
      );
    }

    const data = await response.json() as {
      status?: number;
      data?: {
        token?: string;
        qrcode_url?: string;
        image_url?: string;
        url?: string;
      };
      message?: string;
    };

    if (data.status !== 200) {
      throw new Error(
        `Quark QR code error: ${data.message || "unknown error"}`
      );
    }

    const token = data.data?.token || "";
    const qrcodeUrl = data.data?.qrcode_url || data.data?.url || "";
    const imageUrl = data.data?.image_url || qrcodeUrl;

    if (!token) {
      throw new Error("Quark QR code: no token returned");
    }

    return { token, imageUrl, qrcodeUrl };
  }

  /**
   * Check QR code scan status.
   * Polls the Quark API to see if the user has scanned the QR code.
   * Returns the cookies if authorized.
   */
  async checkQrCodeStatus(
    token: string
  ): Promise<{
    status: "waiting" | "scanned" | "confirmed" | "expired" | "error";
    cookies?: string;
    message?: string;
  }> {
    const url = `${QuarkDriver.API_BASE}/account/qrcode/result`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...QuarkDriver.DEFAULT_HEADERS,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
      redirect: "manual",
    });

    // Check for redirect (successful login often returns a redirect with Set-Cookie)
    if (response.status === 302 || response.status === 301) {
      const setCookieHeaders = response.headers.getSetCookie();
      if (setCookieHeaders && setCookieHeaders.length > 0) {
        const cookies = setCookieHeaders
          .map((header: string) => header.split(";")[0])
          .join("; ");
        this.cookies = cookies;
        return { status: "confirmed", cookies, message: "登录成功" };
      }
    }

    if (!response.ok) {
      return {
        status: "error",
        message: `QR code check failed: ${response.status}`,
      };
    }

    const data = await response.json() as {
      status?: number;
      data?: {
        cookie?: string;
        scan_status?: number;
        status?: number;
      };
      message?: string;
    };

    // Scan status codes (based on reverse-engineering):
    // 0 = waiting for scan
    // 1 = scanned, waiting for confirm
    // 2 = confirmed, login successful
    // 3 = expired
    const scanStatus =
      data.data?.scan_status ?? data.data?.status ?? data.status;

    switch (scanStatus) {
      case 0:
        return { status: "waiting", message: "等待扫描" };
      case 1:
        return { status: "scanned", message: "已扫描，等待确认" };
      case 2: {
        // Confirmed - extract cookies
        if (data.data?.cookie) {
          this.cookies = data.data.cookie;
          return {
            status: "confirmed",
            cookies: data.data.cookie,
            message: "登录成功",
          };
        }
        // Try to extract from response headers
        return {
          status: "confirmed",
          message: "登录成功，但未获取到 cookies",
        };
      }
      case 3:
        return { status: "expired", message: "二维码已过期，请重新获取" };
      default:
        return {
          status: "error",
          message: data.message || `未知状态: ${scanStatus}`,
        };
    }
  }

  /**
   * Validate that the current cookies are still valid.
   * Checks by calling the user info API.
   */
  async validateCookies(): Promise<boolean> {
    if (!this.cookies) return false;

    try {
      const url = `${QuarkDriver.API_BASE}/user/info`;
      const response = await this.quarkRequest(url);
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
   * Override getAuthStatus for Quark's cookie-based auth flow.
   */
  getAuthStatus(): CloudAuthStatus {
    if (this.cookies) {
      return "authorized";
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
   * Make an authenticated API request to Quark with proper headers.
   * Overrides cookieRequest to add Quark-specific headers (Referer, Origin).
   */
  protected async quarkRequest(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    await this.ensureValidToken();
    const headers = new Headers(options.headers || {});

    // Set Quark-specific headers
    headers.set("Cookie", this.cookies);
    headers.set(
      "User-Agent",
      QuarkDriver.DEFAULT_HEADERS["User-Agent"]
    );
    headers.set("Referer", QuarkDriver.DEFAULT_HEADERS["Referer"]);
    headers.set("Origin", QuarkDriver.DEFAULT_HEADERS["Origin"]);

    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(url, { ...options, headers });

    // If 401 or auth error, cookies are invalid
    if (response.status === 401 || response.status === 403) {
      // For Quark, we cannot auto-re-login via API.
      // Just throw an error so the user knows to re-authenticate.
      throw new Error(
        "夸克网盘认证已过期，请重新提供 Cookie 或使用二维码登录"
      );
    }

    return response;
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
        throw new Error(
          `Quark resolvePath: path component "${parts[i]}" not found`
        );
      }

      currentFid = found.id;
      this.pathCache.set(partialPath, found.id);
    }

    return currentFid;
  }

  /**
   * List directory contents by FID.
   * Uses the correct Quark API endpoint with sort parameters.
   */
  private async listDirByFid(fid: string): Promise<FileInfo[]> {
    const url = `${QuarkDriver.API_BASE}/filelist?dir=${fid}&page=1&size=500&sort=file_type:asc,file_name:asc`;

    const response = await this.quarkRequest(url);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Quark listDir failed: ${response.status} ${errorText}`
      );
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
      throw new Error(
        `Quark listDir error: ${data.message || "unknown error"}`
      );
    }

    if (!data.data?.list) {
      return [];
    }

    return data.data.list.map((item) => ({
      name: item.file_name || "unknown",
      size: item.file_size || 0,
      isDir: item.dir || false,
      lastModified: item.updated_at
        ? new Date(item.updated_at * 1000)
        : undefined,
      created: item.created_at ? new Date(item.created_at * 1000) : undefined,
      id: item.fid || "",
      parentPath: fid === "0" ? "/" : fid,
      md5: item.md5 || item.sha1,
    }));
  }

  /**
   * Get parent FID and name from a path.
   */
  private async getParentFidAndName(
    path: string
  ): Promise<{ parentFid: string; name: string }> {
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

      const preCreateResponse = await this.quarkRequest(preCreateUrl, {
        method: "POST",
        body: preCreateBody,
      });

      if (!preCreateResponse.ok) {
        const errorText = await preCreateResponse.text();
        throw new Error(
          `Quark precreate failed: ${preCreateResponse.status} ${errorText}`
        );
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
        throw new Error(
          `Quark precreate error: ${preCreateData.message || "unknown error"}`
        );
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
          throw new Error(
            `Quark file upload failed: ${uploadResponse.status}`
          );
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

        const completeResponse = await this.quarkRequest(completeUrl, {
          method: "POST",
          body: completeBody,
        });

        if (!completeResponse.ok) {
          const errorText = await completeResponse.text();
          throw new Error(
            `Quark complete upload failed: ${completeResponse.status} ${errorText}`
          );
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
      const fileUrl = await this.getDownloadLink(path);

      // Download the file content
      const fileResponse = await fetch(fileUrl, {
        headers: {
          ...QuarkDriver.DEFAULT_HEADERS,
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
   * Get the download URL for a file on Quark Drive.
   * Returns the download URL from the Quark API.
   */
  async getDownloadLink(path: string): Promise<string> {
    return this.withRateLimit(async () => {
      const normalizedPath = path.replace(/^\/+|\/+$/g, "");
      const lastSlash = normalizedPath.lastIndexOf("/");
      const parentPath = normalizedPath.substring(0, lastSlash) || "/";
      const fileName = normalizedPath.substring(lastSlash + 1);

      // Find the file in the parent directory
      const files = await this.listDir(parentPath);
      const file = files.find((f) => f.name === fileName && !f.isDir);

      if (!file || !file.id) {
        throw new Error(
          `Quark getDownloadLink: file "${fileName}" not found`
        );
      }

      // Get download URL
      const downloadUrl = `${QuarkDriver.API_BASE}/file/download`;
      const downloadBody = JSON.stringify({
        fid: file.id,
      });

      const downloadResponse = await this.quarkRequest(downloadUrl, {
        method: "POST",
        body: downloadBody,
      });

      if (!downloadResponse.ok) {
        const errorText = await downloadResponse.text();
        throw new Error(
          `Quark getDownloadLink failed: ${downloadResponse.status} ${errorText}`
        );
      }

      const downloadData = await downloadResponse.json() as {
        status?: number;
        data?: {
          download_url?: string;
          url?: string;
        };
        message?: string;
      };

      const fileUrl =
        downloadData.data?.download_url || downloadData.data?.url;
      if (!fileUrl) {
        throw new Error("Quark getDownloadLink: no download URL returned");
      }

      return fileUrl;
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

      const response = await this.quarkRequest(url, {
        method: "POST",
        body,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Quark deleteFile failed: ${response.status} ${errorText}`
        );
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

      const response = await this.quarkRequest(url, {
        method: "POST",
        body,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Quark createDir failed: ${response.status} ${errorText}`
        );
      }

      const data = await response.json() as {
        status?: number;
        data?: { fid?: string };
        message?: string;
      };

      if (data.status !== 200) {
        throw new Error(
          `Quark createDir error: ${data.message || "unknown error"}`
        );
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
  async getStorageInfo(): Promise<{
    used: number;
    total: number;
    available: number;
  }> {
    return this.withRateLimit(async () => {
      const url = `${QuarkDriver.API_BASE}/user/info`;

      const response = await this.quarkRequest(url);
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
      const total =
        data.data?.total_size || data.data?.space_total || 10737418240;
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
    return { healthy: false, message: "夸克网盘未提供 Cookie，请先登录" };
  }
}

export const quarkDriverFactory: StorageDriverFactory = {
  type: "quark",
  displayName: "夸克网盘",
  description:
    "连接到夸克网盘，支持文件上传、下载和管理。通过 Cookie 或二维码扫描登录（无公开登录 API）",
  authType: "password", // Cookie-based auth maps to "password" type
  configFields: [
    {
      key: "cookies",
      label: "Cookie",
      type: "password",
      required: true,
      placeholder:
        "从浏览器中复制夸克网盘的 Cookie",
      helpText:
        "【主要登录方式】请从浏览器中登录夸克网盘 (pan.quark.cn)，然后从开发者工具 (F12) → 网络 → 请求头 中复制 Cookie。也可以使用二维码扫描登录自动获取。",
    },
  ] as StorageDriverConfigField[],
  create: (config) => new QuarkDriver(config),
};
