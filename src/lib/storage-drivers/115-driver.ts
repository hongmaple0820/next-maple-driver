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
 * Key concepts:
 * - Uses CID-based directory identification (each folder has a unique CID)
 * - Root directory has CID "0"
 * - File operations use CID to identify parent directory
 * - Cookies are required for all API calls
 *
 * API endpoints are undocumented/reverse-engineered.
 */
export class Drive115Driver extends CookieAuthDriver {
  readonly type = "115";

  // 115 API endpoints
  private static readonly API_BASE = "https://webapi.115.com";
  private static readonly PROXY_URL = "https://proapi.115.com";
  private static readonly UPLOAD_URL = "https://uplb.115.com/3.0/initupload.php";

  // CID-based path cache
  private pathCache: Map<string, string> = new Map();

  constructor(config: StorageDriverConfig) {
    super(config);
    // Initialize cache with root
    this.pathCache.set("/", "0");
  }

  /**
   * Login to 115 Wangpan with username/password.
   * Returns session cookies.
   */
  async login(): Promise<string> {
    const url = `${Drive115Driver.API_BASE}/user/login`;
    const body = new URLSearchParams({
      account: this.username,
      passwd: this.password,
      version: "20.1.1",
      device: "CloudDrive",
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      body: body.toString(),
      redirect: "manual",
    });

    if (!response.ok && response.status !== 302) {
      const errorText = await response.text();
      throw new Error(`115 login failed: ${response.status} ${errorText}`);
    }

    // Extract cookies from response headers
    const setCookieHeaders = response.headers.getSetCookie();
    if (!setCookieHeaders || setCookieHeaders.length === 0) {
      // Try parsing from response body if available
      try {
        const data = await response.json() as { state?: boolean; cookie?: string; error?: string };
        if (data.cookie) {
          this.cookies = data.cookie;
          return data.cookie;
        }
        if (data.state === false) {
          throw new Error(`115 login failed: ${data.error || "invalid credentials"}`);
        }
      } catch {
        // If not JSON, try to extract cookies from headers
      }
      throw new Error("115 login: no cookies returned");
    }

    const cookies = setCookieHeaders
      .map((header: string) => header.split(";")[0])
      .join("; ");

    this.cookies = cookies;
    return cookies;
  }

  /**
   * Validate that the current cookies are still valid.
   */
  async validateCookies(): Promise<boolean> {
    if (!this.cookies) return false;

    try {
      const url = `${Drive115Driver.API_BASE}/user/check`;
      const response = await this.cookieRequest(url);
      if (!response.ok) return false;

      const data = await response.json() as { state?: boolean; uid?: number };
      return data.state === true || !!data.uid;
    } catch {
      return false;
    }
  }

  protected getMaxConcurrent(): number {
    return 2; // 115 has very strict rate limits
  }

  protected getMinInterval(): number {
    return 500; // 500ms between calls
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
   */
  private async listDirByCid(cid: string): Promise<FileInfo[]> {
    const url = `${Drive115Driver.API_BASE}/files/filelist?cid=${cid}&offset=0&limit=1150&show_dir=1`;

    const response = await this.cookieRequest(url);
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
        pc?: string;         // parent cid
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
      const checkUrl = `${Drive115Driver.UPLOAD_URL}`;
      const checkBody = new URLSearchParams({
        name: name,
        size: String(data.length),
        sha1: sha1,
        target: `U_1_${parentCid}`,
        rp: String(Date.now()),
      });

      const checkResponse = await this.cookieRequest(checkUrl, {
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
        const uploadResponse = await this.cookieRequest(uploadUrl, {
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
      const normalizedPath = path.replace(/^\/+|\/+$/g, "");
      const lastSlash = normalizedPath.lastIndexOf("/");
      const parentPath = normalizedPath.substring(0, lastSlash) || "/";
      const fileName = normalizedPath.substring(lastSlash + 1);

      // Find the file in the parent directory
      const files = await this.listDir(parentPath);
      const file = files.find((f) => f.name === fileName && !f.isDir);

      if (!file || !file.id) {
        throw new Error(`115 readFile: file "${fileName}" not found`);
      }

      // Get download URL
      const downloadUrl = `${Drive115Driver.API_BASE}/files/download?pickcode=${file.id}`;
      const downloadResponse = await this.cookieRequest(downloadUrl);

      if (!downloadResponse.ok) {
        const errorText = await downloadResponse.text();
        throw new Error(`115 getDownloadUrl failed: ${downloadResponse.status} ${errorText}`);
      }

      const downloadData = await downloadResponse.json() as {
        file_url?: string;
        FileUrl?: string;
      };

      const fileUrl = downloadData.file_url || downloadData.FileUrl;
      if (!fileUrl) {
        throw new Error("115 readFile: no download URL returned");
      }

      // Download the file content
      const fileResponse = await fetch(fileUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
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
        cid: await this.resolvePathToCid(parentPath),
      });

      const response = await this.cookieRequest(url, {
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

      const response = await this.cookieRequest(url, {
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

      const response = await this.cookieRequest(url);
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
