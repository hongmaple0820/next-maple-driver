import { CloudDriverBase } from "./cloud-driver-base";
import type {
  StorageDriverConfig,
  StorageDriverFactory,
  StorageDriverConfigField,
  OAuthConfig,
  FileInfo,
} from "./types";

/**
 * Google Drive Driver
 *
 * Uses Google Drive API v3 with OAuth2 for authentication.
 * API docs: https://developers.google.com/drive/api/v3/reference
 *
 * Key concepts:
 * - Uses file ID based system (not path-based)
 * - Each file/folder has a unique alphanumeric ID
 * - Root directory has ID "root"
 * - Folders have mimeType "application/vnd.google-apps.folder"
 * - Files can have multiple parents
 * - Path-to-ID resolution is cached for efficiency
 *
 * OAuth2 Flow:
 * 1. User visits Google authorization URL
 * 2. Google redirects back with authorization code
 * 3. Exchange code for access token + refresh token
 * 4. Use access token to call Google Drive API
 *
 * Note: Google OAuth requires offline access (access_type=offline) to get refresh tokens.
 */
export class GoogleDriver extends CloudDriverBase {
  readonly type = "google";

  // Google Drive API endpoints
  private static readonly API_BASE = "https://www.googleapis.com/drive/v3";
  private static readonly UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3";

  // Path to file ID cache for efficient resolution
  private pathCache: Map<string, string> = new Map();

  constructor(config: StorageDriverConfig) {
    super(config);
    // Initialize cache with root
    this.pathCache.set("/", "root");
  }

  getOAuthConfig(): OAuthConfig {
    return {
      clientId: this.config.config.clientId || "",
      clientSecret: this.config.config.clientSecret || "",
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: [
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/drive.file",
      ],
      redirectUri: this.config.config.redirectUri || "",
      extraAuthParams: {
        access_type: "offline",    // Required for refresh token
        prompt: "consent",         // Force consent to get new refresh token
      },
    };
  }

  protected getMaxConcurrent(): number {
    return 10; // Google allows higher concurrency
  }

  protected getMinInterval(): number {
    return 50; // 50ms between calls
  }

  /**
   * Resolve a virtual path to a Google Drive file ID.
   * Traverses the directory tree from root, caching results.
   */
  private async resolvePathToFileId(path: string): Promise<string> {
    const normalizedPath = path.replace(/^\/+|\/+$/g, "") || "/";

    // Check cache first
    if (this.pathCache.has(normalizedPath)) {
      return this.pathCache.get(normalizedPath)!;
    }

    // Traverse from root
    const parts = normalizedPath.split("/").filter(Boolean);
    let currentId = "root";

    for (let i = 0; i < parts.length; i++) {
      const partialPath = "/" + parts.slice(0, i + 1).join("/");

      // Check cache for this partial path
      if (this.pathCache.has(partialPath)) {
        currentId = this.pathCache.get(partialPath)!;
        continue;
      }

      // Search for the child in the current directory
      const query = `'${currentId}' in parents and name = '${parts[i].replace(/'/g, "\\'")}' and trashed = false`;
      const url = `${GoogleDriver.API_BASE}/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType)&pageSize=10`;

      const response = await this.apiRequest(url);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google resolvePath failed at ${partialPath}: ${response.status} ${errorText}`);
      }

      const data = await response.json() as {
        files?: Array<{ id: string; name: string; mimeType: string }>;
      };

      if (!data.files || data.files.length === 0) {
        throw new Error(`Google resolvePath: path component "${parts[i]}" not found`);
      }

      currentId = data.files[0].id;
      this.pathCache.set(partialPath, data.files[0].id);
    }

    return currentId;
  }

  /**
   * Get the parent file ID and filename from a path.
   */
  private async getParentIdAndName(path: string): Promise<{ parentId: string; name: string }> {
    const normalizedPath = path.replace(/^\/+|\/+$/g, "");
    const lastSlash = normalizedPath.lastIndexOf("/");
    const name = normalizedPath.substring(lastSlash + 1);
    const parentPath = normalizedPath.substring(0, lastSlash) || "/";

    const parentId = await this.resolvePathToFileId(parentPath);
    return { parentId, name };
  }

  /**
   * Convert a Google Drive API file resource to FileInfo.
   */
  private googleFileToFileInfo(file: GoogleDriveFile, parentPath: string): FileInfo {
    const isFolder = file.mimeType === "application/vnd.google-apps.folder";
    return {
      name: file.name || "unknown",
      size: parseInt(file.size || "0", 10),
      isDir: isFolder,
      lastModified: file.modifiedTime ? new Date(file.modifiedTime) : undefined,
      created: file.createdTime ? new Date(file.createdTime) : undefined,
      id: file.id,
      parentPath,
      mimeType: file.mimeType,
      extension: file.fileExtension,
      thumbnailUrl: file.thumbnailLink,
      md5: file.md5Checksum,
    };
  }

  // --- Google Drive API implementations ---

  /**
   * List files in a directory on Google Drive.
   * Uses Drive API: files.list with q parameter
   */
  async listDir(path: string): Promise<FileInfo[]> {
    return this.withRateLimit(async () => {
      const normalizedPath = path.replace(/^\/+|\/+$/g, "") || "/";
      const parentId = await this.resolvePathToFileId(normalizedPath);

      const query = `'${parentId}' in parents and trashed = false`;
      const fields = "files(id,name,mimeType,size,modifiedTime,createdTime,fileExtension,thumbnailLink,md5Checksum),nextPageToken";
      let url = `${GoogleDriver.API_BASE}/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&pageSize=200&orderBy=name`;

      const allItems: FileInfo[] = [];

      do {
        const response = await this.apiRequest(url);
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Google listDir failed: ${response.status} ${errorText}`);
        }

        const data = await response.json() as {
          files?: GoogleDriveFile[];
          nextPageToken?: string;
        };

        if (data.files) {
          for (const file of data.files) {
            const itemPath = normalizedPath === "/" ? `/${file.name}` : `${normalizedPath}/${file.name}`;
            // Cache file ID by path
            this.pathCache.set(itemPath, file.id);

            allItems.push(this.googleFileToFileInfo(file, normalizedPath));
          }
        }

        // Handle pagination
        if (data.nextPageToken) {
          url = `${GoogleDriver.API_BASE}/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&pageSize=200&pageToken=${data.nextPageToken}&orderBy=name`;
        } else {
          break;
        }
      } while (true);

      return allItems;
    });
  }

  /**
   * Upload a file to Google Drive.
   * For small files: simple upload (multipart)
   * For large files: resumable upload
   */
  async writeFile(path: string, data: Buffer): Promise<void> {
    return this.withRateLimit(async () => {
      const { parentId, name } = await this.getParentIdAndName(path);

      // Check if file already exists (for overwrite)
      const existingId = await this.findFileByName(parentId, name);

      if (data.length < 5 * 1024 * 1024) {
        // Small file: multipart upload
        await this.uploadSmallFile(parentId, name, data, existingId);
      } else {
        // Large file: resumable upload
        await this.uploadLargeFile(parentId, name, data, existingId);
      }

      // Invalidate cache for this path
      const normalizedPath = path.replace(/^\/+|\/+$/g, "");
      this.pathCache.delete(normalizedPath);
    });
  }

  /**
   * Find a file by name in a parent directory.
   */
  private async findFileByName(parentId: string, name: string): Promise<string | null> {
    const query = `'${parentId}' in parents and name = '${name.replace(/'/g, "\\'")}' and trashed = false`;
    const url = `${GoogleDriver.API_BASE}/files?q=${encodeURIComponent(query)}&fields=files(id)&pageSize=1`;

    const response = await this.apiRequest(url);
    if (!response.ok) {
      return null;
    }

    const data = await response.json() as {
      files?: Array<{ id: string }>;
    };

    return data.files?.[0]?.id || null;
  }

  /**
   * Upload a small file using multipart upload.
   */
  private async uploadSmallFile(parentId: string, name: string, data: Buffer, existingId: string | null): Promise<void> {
    if (existingId) {
      // Update existing file
      const url = `${GoogleDriver.UPLOAD_URL}/files/${existingId}?uploadType=media`;
      const response = await this.apiRequest(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/octet-stream" },
        body: data,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google file update failed: ${response.status} ${errorText}`);
      }
      return;
    }

    // Create new file with multipart upload
    const boundary = "-------314159265358979323846";
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelim = `\r\n--${boundary}--`;

    const metadata = JSON.stringify({
      name,
      parents: [parentId],
    });

    const body =
      delimiter +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      metadata +
      delimiter +
      "Content-Type: application/octet-stream\r\n\r\n" +
      new TextDecoder().decode(data) +
      closeDelim;

    const url = `${GoogleDriver.UPLOAD_URL}/files?uploadType=multipart`;
    const response = await this.apiRequest(url, {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google small file upload failed: ${response.status} ${errorText}`);
    }
  }

  /**
   * Upload a large file using resumable upload.
   */
  private async uploadLargeFile(parentId: string, name: string, data: Buffer, existingId: string | null): Promise<void> {
    // Step 1: Initiate resumable upload session
    const metadata = existingId ? {} : { name, parents: [parentId] };
    const initiateUrl = existingId
      ? `${GoogleDriver.UPLOAD_URL}/files/${existingId}?uploadType=resumable`
      : `${GoogleDriver.UPLOAD_URL}/files?uploadType=resumable`;

    const initiateResponse = await this.apiRequest(initiateUrl, {
      method: existingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metadata),
    });

    if (!initiateResponse.ok) {
      const errorText = await initiateResponse.text();
      throw new Error(`Google resumable upload initiation failed: ${initiateResponse.status} ${errorText}`);
    }

    const uploadUrl = initiateResponse.headers.get("Location");
    if (!uploadUrl) {
      throw new Error("Google resumable upload: no upload URL returned");
    }

    // Step 2: Upload the file content in chunks
    const chunkSize = 8 * 1024 * 1024; // 8MB chunks
    const totalChunks = Math.ceil(data.length / chunkSize);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, data.length);
      const chunkData = data.subarray(start, end);

      const chunkResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Length": String(end - start),
          "Content-Range": `bytes ${start}-${end - 1}/${data.length}`,
        },
        body: chunkData,
      });

      if (!chunkResponse.ok && chunkResponse.status !== 308) {
        const errorText = await chunkResponse.text();
        throw new Error(`Google chunk upload failed at ${start}-${end}: ${chunkResponse.status} ${errorText}`);
      }
    }
  }

  /**
   * Download a file from Google Drive.
   * Uses Drive API: files.get with alt=media
   */
  async readFile(path: string): Promise<Buffer> {
    return this.withRateLimit(async () => {
      const fileId = await this.resolvePathToFileId(path);
      const url = `${GoogleDriver.API_BASE}/files/${fileId}?alt=media`;

      const response = await this.apiRequest(url);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google readFile failed: ${response.status} ${errorText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    });
  }

  /**
   * Delete a file from Google Drive.
   * Uses Drive API: DELETE /files/{fileId}
   */
  async deleteFile(path: string): Promise<void> {
    return this.withRateLimit(async () => {
      const fileId = await this.resolvePathToFileId(path);
      const url = `${GoogleDriver.API_BASE}/files/${fileId}`;

      const response = await this.apiRequest(url, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google deleteFile failed: ${response.status} ${errorText}`);
      }

      // Invalidate cache
      const normalizedPath = path.replace(/^\/+|\/+$/g, "");
      this.pathCache.delete(normalizedPath);
    });
  }

  /**
   * Check if a file exists on Google Drive.
   */
  async fileExists(path: string): Promise<boolean> {
    try {
      const fileId = await this.resolvePathToFileId(path);
      return !!fileId;
    } catch {
      return false;
    }
  }

  /**
   * Get file size from Google Drive.
   */
  async getFileSize(path: string): Promise<number> {
    return this.withRateLimit(async () => {
      const fileId = await this.resolvePathToFileId(path);
      const url = `${GoogleDriver.API_BASE}/files/${fileId}?fields=size`;

      const response = await this.apiRequest(url);
      if (!response.ok) {
        throw new Error(`Google getFileSize failed: ${response.status}`);
      }

      const data = await response.json() as { size?: string };
      return parseInt(data.size || "0", 10);
    });
  }

  /**
   * Create a directory on Google Drive.
   * Uses POST /drive/v3/files with mimeType folder
   */
  async createDir(path: string): Promise<void> {
    return this.withRateLimit(async () => {
      const { parentId, name } = await this.getParentIdAndName(path);

      const url = `${GoogleDriver.API_BASE}/files`;
      const response = await this.apiRequest(url, {
        method: "POST",
        body: JSON.stringify({
          name,
          mimeType: "application/vnd.google-apps.folder",
          parents: [parentId],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google createDir failed: ${response.status} ${errorText}`);
      }

      const data = await response.json() as { id?: string };
      if (data.id) {
        const normalizedPath = path.replace(/^\/+|\/+$/g, "");
        this.pathCache.set(normalizedPath, data.id);
      }
    });
  }

  /**
   * Delete a directory from Google Drive.
   * Uses the same DELETE endpoint as files.
   */
  async deleteDir(path: string): Promise<void> {
    return this.deleteFile(path);
  }

  /**
   * Check if a directory exists on Google Drive.
   */
  async dirExists(path: string): Promise<boolean> {
    try {
      const fileId = await this.resolvePathToFileId(path);
      const url = `${GoogleDriver.API_BASE}/files/${fileId}?fields=mimeType`;

      const response = await this.apiRequest(url);
      if (!response.ok) {
        return false;
      }

      const data = await response.json() as { mimeType?: string };
      return data.mimeType === "application/vnd.google-apps.folder";
    } catch {
      return false;
    }
  }

  /**
   * Get storage info from Google Drive.
   * Uses about.get API
   */
  async getStorageInfo(): Promise<{ used: number; total: number; available: number }> {
    return this.withRateLimit(async () => {
      const url = `${GoogleDriver.API_BASE}/about?fields=storageQuota`;

      const response = await this.apiRequest(url);
      if (!response.ok) {
        throw new Error(`Google getStorageInfo failed: ${response.status}`);
      }

      const data = await response.json() as {
        storageQuota?: {
          usage?: string;
          limit?: string;
          usageInDrive?: string;
        };
      };

      const used = parseInt(data.storageQuota?.usage || "0", 10);
      const total = parseInt(data.storageQuota?.limit || "16106127360", 10);
      const available = total - used;
      return { used, total, available };
    });
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    const authStatus = this.getAuthStatus();
    if (authStatus === "authorized") {
      return { healthy: true, message: "Google Drive is connected" };
    }
    if (authStatus === "expired") {
      return { healthy: false, message: "Google Drive authorization expired, please re-authorize" };
    }
    return { healthy: false, message: "Google Drive requires authorization" };
  }
}

/**
 * Google Drive API file resource type
 */
interface GoogleDriveFile {
  id?: string;
  name?: string;
  mimeType?: string;
  size?: string;
  modifiedTime?: string;
  createdTime?: string;
  fileExtension?: string;
  thumbnailLink?: string;
  md5Checksum?: string;
}

export const googleDriverFactory: StorageDriverFactory = {
  type: "google",
  displayName: "Google Drive",
  description: "Connect to Google Drive for file storage and management",
  authType: "oauth",
  configFields: [
    {
      key: "clientId",
      label: "Client ID",
      type: "text",
      required: true,
      placeholder: "xxxxxxxxxxxx.apps.googleusercontent.com",
      helpText: "Google Cloud Console OAuth 2.0 Client ID",
    },
    {
      key: "clientSecret",
      label: "Client Secret",
      type: "password",
      required: true,
      placeholder: "GOCSPX-xxxxxxxxxxxx",
      helpText: "Google Cloud Console OAuth 2.0 Client Secret",
    },
    {
      key: "redirectUri",
      label: "Redirect URI",
      type: "url",
      required: false,
      placeholder: "https://your-domain.com/api/auth/cloud-oauth/callback",
      helpText: "OAuth callback URL (leave empty for default)",
    },
    {
      key: "refreshToken",
      label: "Refresh Token",
      type: "password",
      required: false,
      placeholder: "Existing refresh token",
      helpText: "If you already have a refresh token, enter it here",
    },
  ],
  create: (config) => new GoogleDriver(config),
};
