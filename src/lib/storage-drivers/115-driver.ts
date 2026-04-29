import { CookieAuthDriver } from "./cloud-driver-base";
import type {
  StorageDriverConfig,
  StorageDriverFactory,
  StorageDriverConfigField,
  CloudAuthStatus,
  FileInfo,
} from "./types";

/**
 * 115网盘 (115 Wangpan) Driver
 *
 * Uses cookie-based authentication. There is no reliable public login API.
 * Users must either:
 *   1. Manually provide cookies from their browser session, or
 *   2. Use QR code scanning (scanning with the 115 mobile app)
 *
 * The 115 login endpoint (https://webapi.115.com/user/login) often requires
 * captcha and has anti-bot measures, making username/password login unreliable.
 * AList also uses QR code scanning or manual cookie input for 115.
 *
 * Key concepts:
 * - Uses CID-based directory identification (each folder has a unique CID)
 * - Root directory has CID "0"
 * - File operations use CID to identify parent directory
 * - Cookies are required for all API calls
 * - Uses pickcode for download operations
 *
 * API endpoints are undocumented/reverse-engineered based on AList.
 */
export class Drive115Driver extends CookieAuthDriver {
  readonly type = "115";

  // 115 API endpoints
  private static readonly API_BASE = "https://webapi.115.com";
  private static readonly UPLOAD_URL = "https://uplb.115.com/3.0/initupload.php";
  private static readonly QRCODE_URL = "https://qrcode.115.com/api/2.0/pattern";

  // Standard browser headers for 115 requests
  private static readonly DEFAULT_HEADERS: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Referer: "https://115.com/",
  };

  // CID-based path cache
  private pathCache: Map<string, string> = new Map();

  constructor(config: StorageDriverConfig) {
    super(config);
    // Initialize cache with root
    this.pathCache.set("/", "0");
  }

  /**
   * Login to 115 Wangpan.
   * Since 115 has no reliable public login API, this method:
   * - If cookies are already provided, validates them via /user/check
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
      "115网盘没有可靠的公开登录 API（登录接口经常需要验证码且有反爬措施）。\n" +
        "请通过以下方式之一提供认证信息：\n" +
        "1. 在配置中手动填入浏览器中获取的 Cookie\n" +
        "2. 使用二维码扫描登录（通过 /api/drivers/[id]/qr-login 接口，用115网盘 App 扫码）"
    );
  }

  /**
   * Request a QR code for login via the 115 mobile app.
   * Returns the QR code uid, time, sign, and image URL for the user to scan.
   */
  async requestQrCode(): Promise<{
    uid: string;
    time: string;
    sign: string;
    imageUrl: string;
  }> {
    const url = Drive115Driver.QRCODE_URL;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        ...Drive115Driver.DEFAULT_HEADERS,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `115 QR code request failed: ${response.status} ${errorText}`
      );
    }

    const data = await response.json() as {
      errno?: number;
      data?: {
        uid?: string;
        time?: string | number;
        sign?: string;
        qrcode?: string;
        image_url?: string;
      };
      status?: number;
    };

    if (data.errno && data.errno !== 0) {
      throw new Error(`115 QR code error: errno=${data.errno}`);
    }

    const uid = String(data.data?.uid || "");
    const time = String(data.data?.time || "");
    const sign = data.data?.sign || "";
    const imageUrl = data.data?.qrcode || data.data?.image_url || "";

    if (!uid || !sign) {
      throw new Error("115 QR code: no uid or sign returned");
    }

    return { uid, time, sign, imageUrl };
  }

  /**
   * Check QR code scan status.
   * Polls the 115 API to see if the user has scanned the QR code.
   * Returns the cookies if authorized.
   */
  async checkQrCodeStatus(
    uid: string,
    time: string,
    sign: string
  ): Promise<{
    status: "waiting" | "scanned" | "confirmed" | "expired" | "error";
    cookies?: string;
    message?: string;
  }> {
    const url = `${Drive115Driver.QRCODE_URL}/result`;

    const body = new URLSearchParams({
      uid,
      time,
      sign,
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...Drive115Driver.DEFAULT_HEADERS,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
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
      errno?: number;
      data?: {
        cookie?: string;
        status?: number;
        uid?: string;
        is_scan?: number;
        is_confirm?: number;
      };
      status?: number;
      message?: string;
    };

    // 115 QR code status codes (based on reverse-engineering):
    // errno 0 + status 0 = waiting for scan
    // errno 0 + status 1 = scanned, waiting for confirm
    // errno 0 + status 2 = confirmed, login successful
    // errno 200001 or similar = expired
    const errno = data.errno;
    const scanStatus = data.data?.status;

    if (errno === 0) {
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
        default:
          return {
            status: "error",
            message: `未知状态: ${scanStatus}`,
          };
      }
    }

    // Handle expired or error
    if (errno === 200001 || errno === 200002) {
      return { status: "expired", message: "二维码已过期，请重新获取" };
    }

    return {
      status: "error",
      message: data.message || `QR code error: errno=${errno}`,
    };
  }

  /**
   * Validate that the current cookies are still valid.
   * Checks by calling the user info API.
   */
  async validateCookies(): Promise<boolean> {
    if (!this.cookies) return false;

    try {
      const url = `${Drive115Driver.API_BASE}/user/check`;
      const response = await this.api115Request(url);
      if (!response.ok) return false;

      const data = await response.json() as { state?: boolean; uid?: number };
      return data.state === true || !!data.uid;
    } catch {
      return false;
    }
  }

  /**
   * Override getAuthStatus for 115's cookie-based auth flow.
   * Unlike the base CookieAuthDriver, 115 does not rely on username/password.
   */
  getAuthStatus(): CloudAuthStatus {
    if (this.cookies) {
      return "authorized";
    }
    return "error";
  }

  protected getMaxConcurrent(): number {
    return 2; // 115 has very strict rate limits
  }

  protected getMinInterval(): number {
    return 500; // 500ms between calls
  }

  /**
   * Make an authenticated API request to 115 with proper headers.
   * Overrides cookieRequest to add 115-specific headers (Referer).
   */
  protected async api115Request(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    await this.ensureValidToken();
    const headers = new Headers(options.headers || {});

    // Set 115-specific headers
    headers.set("Cookie", this.cookies);
    headers.set(
      "User-Agent",
      Drive115Driver.DEFAULT_HEADERS["User-Agent"]
    );
    headers.set("Referer", Drive115Driver.DEFAULT_HEADERS["Referer"]);

    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(url, { ...options, headers });

    // If 401 or auth error, cookies are invalid
    if (response.status === 401 || response.status === 403) {
      // For 115, we cannot auto-re-login via API.
      // Just throw an error so the user knows to re-authenticate.
      throw new Error(
        "115网盘认证已过期，请重新提供 Cookie 或使用二维码登录"
      );
    }

    return response;
  }

  /**
   * Resolve a virtual path to a 115 CID.
   * Traverses the directory tree from root.
   */
  private async resolvePathToCid(path: string): Promise<string> {
    const normalizedPath = path.replace(/^\/+|\/+$/g, "") || "/";

    // Check cache first
    if (this.pathCache.has(normalizedPath)) {
      return this.pathCache.get(normalizedPath)!;
    }

    // Traverse from root
    const parts = normalizedPath.split("/").filter(Boolean);
    let currentCid = "0";

    for (let i = 0; i < parts.length; i++) {
      const partialPath = "/" + parts.slice(0, i + 1).join("/");

      // Check cache for this partial path
      if (this.pathCache.has(partialPath)) {
        currentCid = this.pathCache.get(partialPath)!;
        continue;
      }

      // List the current directory to find the child
      const files = await this.listDirByCid(currentCid);
      const found = files.find((f) => f.name === parts[i] && f.isDir);

      if (!found || !found.id) {
        throw new Error(`115 resolvePath: path component "${parts[i]}" not found`);
      }

      currentCid = found.id;
      this.pathCache.set(partialPath, found.id);
    }

    return currentCid;
  }

  /**
   * List directory contents by CID.
   * Uses the correct 115 API endpoint with sort and format parameters.
   */
  private async listDirByCid(cid: string): Promise<FileInfo[]> {
    const url = `${Drive115Driver.API_BASE}/files/filelist?cid=${cid}&offset=0&limit=1150&show_dir=1&snap=0&natsort=1&format=json`;

    const response = await this.api115Request(url);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`115 listDir failed: ${response.status} ${errorText}`);
    }

    const data = await response.json() as {
      data?: Array<{
        fid?: string;
        cid?: string;
        n?: string;         // name
        s?: number;          // size
        ico?: string;        // file type icon
        t?: string;          // "0" for file, "1" for folder
        tp?: number;         // file type
        md5?: string;
        sha1?: string;
        pc?: string;         // pickcode
        pid?: string;        // parent cid
      }>;
      count?: number;
      offset?: number;
      errno?: number;
    };

    if (data.errno && data.errno !== 0) {
      throw new Error(`115 listDir error: errno=${data.errno}`);
    }

    if (!data.data) {
      return [];
    }

    return data.data.map((item) => ({
      name: item.n || "unknown",
      size: item.s || 0,
      isDir: item.t === "1" || item.ico === "folder",
      lastModified: undefined,
      created: undefined,
      id: item.fid || item.cid || "",
      parentPath: cid === "0" ? "/" : cid,
      md5: item.md5 || item.sha1,
    }));
  }

  /**
   * Get parent CID and name from a path.
   */
  private async getParentCidAndName(path: string): Promise<{ parentCid: string; name: string }> {
    const normalizedPath = path.replace(/^\/+|\/+$/g, "");
    const lastSlash = normalizedPath.lastIndexOf("/");
    const name = normalizedPath.substring(lastSlash + 1);
    const parentPath = normalizedPath.substring(0, lastSlash) || "/";

    const parentCid = await this.resolvePathToCid(parentPath);
    return { parentCid, name };
  }

  // --- 115 API implementations ---

  /**
   * List files in a directory on 115 Wangpan.
   */
  async listDir(path: string): Promise<FileInfo[]> {
    return this.withRateLimit(async () => {
      const cid = await this.resolvePathToCid(path);
      return this.listDirByCid(cid);
    });
  }

  /**
   * Upload a file to 115 Wangpan.
   * Uses SHA1 pre-check + upload.
   */
  async writeFile(path: string, data: Buffer): Promise<void> {
    return this.withRateLimit(async () => {
      const { parentCid, name } = await this.getParentCidAndName(path);

      // Calculate SHA1 for deduplication check
      const sha1 = await this.calculateSHA1(data);

      // Step 1: SHA1 pre-check (rapid upload)
      const checkUrl = Drive115Driver.UPLOAD_URL;
      const checkBody = new URLSearchParams({
        name: name,
        size: String(data.length),
        sha1: sha1,
        target: `U_1_${parentCid}`,
        rp: String(Date.now()),
      });

      const checkResponse = await this.api115Request(checkUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: checkBody.toString(),
      });

      if (!checkResponse.ok) {
        const errorText = await checkResponse.text();
        throw new Error(`115 upload pre-check failed: ${checkResponse.status} ${errorText}`);
      }

      const checkData = await checkResponse.json() as {
        status?: number;
        sha1?: string;
        pickcode?: string;
        error?: string;
      };

      // If status is 2, file already exists (deduplication hit)
      if (checkData.status === 2 && checkData.pickcode) {
        return; // File already uploaded via dedup
      }

      // If status is 1, need to actually upload
      if (checkData.status === 1) {
        // Step 2: Upload file data
        const formData = new FormData();
        const blob = new Blob([data]);
        formData.append("file", blob, name);

        const uploadUrl = `${Drive115Driver.UPLOAD_URL}?pickcode=${checkData.pickcode || ""}`;
        const uploadResponse = await this.api115Request(uploadUrl, {
          method: "POST",
          body: formData,
        });

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          throw new Error(`115 upload failed: ${uploadResponse.status} ${errorText}`);
        }
      }

      // Invalidate cache for this path
      const normalizedPath = path.replace(/^\/+|\/+$/g, "");
      this.pathCache.delete(normalizedPath);
    });
  }

  /**
   * Calculate SHA1 hash of a buffer.
   */
  private async calculateSHA1(data: Buffer): Promise<string> {
    // Use SubtleCrypto SHA-1
    const hashBuffer = await crypto.subtle.digest("SHA-1", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  }

  /**
   * Download a file from 115 Wangpan.
   * First gets the download URL, then downloads the file content.
   */
  async readFile(path: string): Promise<Buffer> {
    return this.withRateLimit(async () => {
      const fileUrl = await this.getDownloadLink(path);

      // Download the file content
      const fileResponse = await fetch(fileUrl, {
        headers: {
          ...Drive115Driver.DEFAULT_HEADERS,
          Cookie: this.cookies,
        },
      });

      if (!fileResponse.ok) {
        throw new Error(`115 file download failed: ${fileResponse.status}`);
      }

      const arrayBuffer = await fileResponse.arrayBuffer();
      return Buffer.from(arrayBuffer);
    });
  }

  /**
   * Get the download URL for a file on 115 Wangpan.
   * Returns the download URL from the 115 API.
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
        throw new Error(`115 getDownloadLink: file "${fileName}" not found`);
      }

      // Get download URL using pickcode (file id serves as pickcode in 115 API)
      const downloadUrl = `${Drive115Driver.API_BASE}/files/download?pickcode=${file.id}`;
      const downloadResponse = await this.api115Request(downloadUrl);

      if (!downloadResponse.ok) {
        const errorText = await downloadResponse.text();
        throw new Error(`115 getDownloadLink failed: ${downloadResponse.status} ${errorText}`);
      }

      const downloadData = await downloadResponse.json() as {
        file_url?: string;
        FileUrl?: string;
      };

      const fileUrl = downloadData.file_url || downloadData.FileUrl;
      if (!fileUrl) {
        throw new Error("115 getDownloadLink: no download URL returned");
      }

      return fileUrl;
    });
  }

  /**
   * Delete a file from 115 Wangpan.
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
        throw new Error(`115 deleteFile: file "${fileName}" not found`);
      }

      const url = `${Drive115Driver.API_BASE}/files/delete`;
      const body = new URLSearchParams({
        fid: file.id,
      });

      const response = await this.api115Request(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`115 deleteFile failed: ${response.status} ${errorText}`);
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
   * Create a directory on 115 Wangpan.
   */
  async createDir(path: string): Promise<void> {
    return this.withRateLimit(async () => {
      const { parentCid, name } = await this.getParentCidAndName(path);

      const url = `${Drive115Driver.API_BASE}/files/add`;
      const body = new URLSearchParams({
        cname: name,
        pid: parentCid,
      });

      const response = await this.api115Request(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`115 createDir failed: ${response.status} ${errorText}`);
      }

      const data = await response.json() as {
        state?: boolean;
        cid?: string;
        error?: string;
      };

      if (data.state === false) {
        throw new Error(`115 createDir failed: ${data.error || "unknown error"}`);
      }

      // Cache the new CID
      if (data.cid) {
        const normalizedPath = path.replace(/^\/+|\/+$/g, "");
        this.pathCache.set(normalizedPath, data.cid);
      }
    });
  }

  /**
   * Delete a directory from 115 Wangpan.
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
   * Get storage info from 115 Wangpan.
   */
  async getStorageInfo(): Promise<{ used: number; total: number; available: number }> {
    return this.withRateLimit(async () => {
      const url = `${Drive115Driver.API_BASE}/user/info`;

      const response = await this.api115Request(url);
      if (!response.ok) {
        throw new Error(`115 getStorageInfo failed: ${response.status}`);
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
      const total = data.data?.total_size || data.data?.space_total || 0;
      return { used, total, available: total - used };
    });
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    const authStatus = this.getAuthStatus();
    if (authStatus === "authorized") {
      // Validate cookies are still good
      const valid = await this.validateCookies();
      if (valid) {
        return { healthy: true, message: "115网盘已连接" };
      }
      return { healthy: false, message: "115网盘登录已过期，请重新登录" };
    }
    return { healthy: false, message: "115网盘未提供 Cookie，请先登录" };
  }
}

export const drive115DriverFactory: StorageDriverFactory = {
  type: "115",
  displayName: "115网盘",
  description:
    "连接到115网盘，支持文件上传、下载和管理。通过 Cookie 或二维码扫描登录（无可靠的公开登录 API）",
  authType: "password", // Cookie-based auth maps to "password" type
  configFields: [
    {
      key: "cookies",
      label: "Cookie",
      type: "password",
      required: true,
      placeholder: "从浏览器中复制115网盘的 Cookie",
      helpText:
        "【主要登录方式】请从浏览器中登录115网盘 (115.com)，然后从开发者工具 (F12) → 网络 → 请求头 中复制 Cookie。也可以使用二维码扫描登录自动获取。",
    },
  ] as StorageDriverConfigField[],
  create: (config) => new Drive115Driver(config),
};
