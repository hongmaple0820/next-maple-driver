import { CloudDriverBase } from "./cloud-driver-base";
import type {
  StorageDriverConfig,
  StorageDriverFactory,
  StorageDriverConfigField,
  OAuthConfig,
  FileInfo,
} from "./types";

/**
 * OneDrive Driver
 *
 * Uses Microsoft Graph API with OAuth2 for authentication.
 * API docs: https://learn.microsoft.com/en-us/onedrive/developer/rest-api/
 *
 * OAuth2 Flow:
 * 1. User visits Microsoft authorization URL
 * 2. Microsoft redirects back with authorization code
 * 3. Exchange code for access token + refresh token
 * 4. Use access token to call Microsoft Graph API
 *
 * Supports both personal (Microsoft account) and work/school (Azure AD) accounts.
 * The tenantId config field controls the account type:
 *   - "consumers" for personal Microsoft accounts only
 *   - "organizations" for work/school accounts only
 *   - "common" for both (default)
 *   - A specific tenant GUID for single-tenant Azure AD apps
 *
 * OneDrive uses path-based access via the Graph API:
 *   - GET /me/drive/root:/{path}:/children — list directory
 *   - PUT /me/drive/root:/{path}:/content — upload small file
 *   - GET /me/drive/root:/{path}:/content — download file
 *   - DELETE /me/drive/root:/{path} — delete file/folder
 *   - POST /me/drive/root:/{parent-path}:/children — create folder
 */
export class OneDriveDriver extends CloudDriverBase {
  readonly type = "onedrive";

  // Microsoft Graph API endpoints
  private static readonly GRAPH_API = "https://graph.microsoft.com/v1.0";

  private tenantId: string;

  constructor(config: StorageDriverConfig) {
    super(config);
    this.tenantId = config.config.tenantId || "common";
  }

  getOAuthConfig(): OAuthConfig {
    // Microsoft uses tenant-specific endpoints
    const tenant = this.tenantId || "common";
    return {
      clientId: this.config.config.clientId || "",
      clientSecret: this.config.config.clientSecret || "",
      authorizationUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
      tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      scopes: [
        "Files.ReadWrite.All",
        "Files.Read.All",
        "User.Read",
        "offline_access",
      ],
      redirectUri: this.config.config.redirectUri || "",
      extraAuthParams: {
        response_mode: "query",
      },
    };
  }

  protected getMaxConcurrent(): number {
    return 4;
  }

  protected getMinInterval(): number {
    return 150;
  }

  /**
   * Normalize a path for OneDrive Graph API.
   * Removes leading/trailing slashes and encodes properly.
   */
  private normalizePath(path: string): string {
    return path.replace(/^\/+|\/+$/g, "");
  }

  /**
   * Get the Graph API path for a given file/folder path.
   * For root: /me/drive/root
   * For a path: /me/drive/root:/{path}:
   */
  private getItemPath(path: string): string {
    const normalized = this.normalizePath(path);
    if (!normalized) {
      return "/me/drive/root";
    }
    return `/me/drive/root:/${normalized}:`;
  }

  /**
   * Convert a Microsoft Graph API DriveItem to FileInfo.
   */
  private driveItemToFileInfo(item: DriveItem, parentPath: string): FileInfo {
    const name = item.name || "unknown";
    return {
      name,
      size: item.size || 0,
      isDir: !!item.folder,
      lastModified: item.lastModifiedDateTime ? new Date(item.lastModifiedDateTime) : undefined,
      created: item.createdDateTime ? new Date(item.createdDateTime) : undefined,
      id: item.id,
      parentPath,
      mimeType: item.file?.mimeType,
      downloadUrl: item["@content.downloadUrl"],
      thumbnailUrl: item.thumbnails?.[0]?.medium?.url,
    };
  }

  // --- OneDrive Graph API implementations ---

  /**
   * List files in a directory on OneDrive.
   * Uses Microsoft Graph API: GET /me/drive/root:/{path}:/children
   */
  async listDir(path: string): Promise<FileInfo[]> {
    return this.withRateLimit(async () => {
      const normalizedPath = this.normalizePath(path);
      const itemPath = this.getItemPath(path);
      const url = `${OneDriveDriver.GRAPH_API}${itemPath}/children?$top=200&$select=id,name,size,folder,file,lastModifiedDateTime,createdDateTime,@content.downloadUrl,thumbnails`;

      const response = await this.apiRequest(url);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OneDrive listDir failed: ${response.status} ${errorText}`);
      }

      const data = await response.json() as {
        value?: DriveItem[];
        "@odata.nextLink"?: string;
      };

      const items = data.value || [];
      let allItems = items.map((item) => this.driveItemToFileInfo(item, normalizedPath));

      // Handle pagination
      let nextLink = data["@odata.nextLink"];
      while (nextLink) {
        const nextResponse = await this.apiRequest(nextLink);
        if (!nextResponse.ok) {
          break;
        }
        const nextData = await nextResponse.json() as {
          value?: DriveItem[];
          "@odata.nextLink"?: string;
        };
        allItems = allItems.concat(
          (nextData.value || []).map((item) => this.driveItemToFileInfo(item, normalizedPath))
        );
        nextLink = nextData["@odata.nextLink"];
      }

      return allItems;
    });
  }

  /**
   * Upload a file to OneDrive.
   * For files < 4MB: single PUT request
   * For larger files: create upload session (resumable upload)
   */
  async writeFile(path: string, data: Buffer): Promise<void> {
    return this.withRateLimit(async () => {
      const itemPath = this.getItemPath(path);

      if (data.length < 4 * 1024 * 1024) {
        // Small file: single PUT
        const url = `${OneDriveDriver.GRAPH_API}${itemPath}:/content`;
        const response = await this.apiRequest(url, {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream" },
          body: data,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`OneDrive upload failed: ${response.status} ${errorText}`);
        }
      } else {
        // Large file: resumable upload session
        await this.uploadLargeFile(itemPath, data);
      }
    });
  }

  /**
   * Upload a large file using a resumable upload session.
   */
  private async uploadLargeFile(itemPath: string, data: Buffer): Promise<void> {
    // Step 1: Create upload session
    const sessionUrl = `${OneDriveDriver.GRAPH_API}${itemPath}:/createUploadSession`;
    const sessionResponse = await this.apiRequest(sessionUrl, {
      method: "POST",
      body: JSON.stringify({
        item: {
          "@microsoft.graph.conflictBehavior": "overwrite",
        },
      }),
    });

    if (!sessionResponse.ok) {
      const errorText = await sessionResponse.text();
      throw new Error(`OneDrive createUploadSession failed: ${sessionResponse.status} ${errorText}`);
    }

    const sessionData = await sessionResponse.json() as {
      uploadUrl?: string;
    };

    if (!sessionData.uploadUrl) {
      throw new Error("OneDrive createUploadSession: no upload URL returned");
    }

    // Step 2: Upload chunks (10MB each)
    const chunkSize = 10 * 1024 * 1024;
    const totalChunks = Math.ceil(data.length / chunkSize);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, data.length);
      const chunkData = data.subarray(start, end);

      const chunkResponse = await fetch(sessionData.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Length": String(end - start),
          "Content-Range": `bytes ${start}-${end - 1}/${data.length}`,
        },
        body: chunkData,
      });

      if (!chunkResponse.ok) {
        const errorText = await chunkResponse.text();
        throw new Error(`OneDrive chunk upload failed at ${start}-${end}: ${chunkResponse.status} ${errorText}`);
      }
    }
  }

  /**
   * Download a file from OneDrive.
   * Uses Microsoft Graph API: GET /me/drive/root:/{path}:/content
   */
  async readFile(path: string): Promise<Buffer> {
    return this.withRateLimit(async () => {
      const downloadUrl = await this.getDownloadLink(path);

      const downloadResponse = await fetch(downloadUrl);
      if (!downloadResponse.ok) {
        throw new Error(`OneDrive download failed: ${downloadResponse.status}`);
      }

      const arrayBuffer = await downloadResponse.arrayBuffer();
      return Buffer.from(arrayBuffer);
    });
  }

  /**
   * Get the download link for a file on OneDrive.
   * Returns the @microsoft.graph.downloadUrl from the Graph API.
   */
  async getDownloadLink(path: string): Promise<string> {
    return this.withRateLimit(async () => {
      const itemPath = this.getItemPath(path);
      const url = `${OneDriveDriver.GRAPH_API}${itemPath}?$select=@microsoft.graph.downloadUrl`;

      const response = await this.apiRequest(url);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OneDrive getDownloadLink failed: ${response.status} ${errorText}`);
      }

      const data = await response.json() as {
        "@microsoft.graph.downloadUrl"?: string;
      };

      if (!data["@microsoft.graph.downloadUrl"]) {
        throw new Error("OneDrive getDownloadLink: no download URL returned");
      }

      return data["@microsoft.graph.downloadUrl"];
    });
  }

  /**
   * Delete a file from OneDrive.
   * Uses Microsoft Graph API: DELETE /me/drive/root:/{path}
   */
  async deleteFile(path: string): Promise<void> {
    return this.withRateLimit(async () => {
      const itemPath = this.getItemPath(path);
      const url = `${OneDriveDriver.GRAPH_API}${itemPath}`;

      const response = await this.apiRequest(url, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OneDrive deleteFile failed: ${response.status} ${errorText}`);
      }
    });
  }

  /**
   * Check if a file exists on OneDrive.
   */
  async fileExists(path: string): Promise<boolean> {
    return this.withRateLimit(async () => {
      const itemPath = this.getItemPath(path);
      const url = `${OneDriveDriver.GRAPH_API}${itemPath}?$select=id`;

      const response = await this.apiRequest(url);
      return response.ok;
    });
  }

  /**
   * Get file size from OneDrive.
   */
  async getFileSize(path: string): Promise<number> {
    return this.withRateLimit(async () => {
      const itemPath = this.getItemPath(path);
      const url = `${OneDriveDriver.GRAPH_API}${itemPath}?$select=size`;

      const response = await this.apiRequest(url);
      if (!response.ok) {
        throw new Error(`OneDrive getFileSize failed: ${response.status}`);
      }

      const data = await response.json() as { size?: number };
      return data.size || 0;
    });
  }

  /**
   * Create a directory on OneDrive.
   * Uses POST /me/drive/root:/{parent-path}:/children
   */
  async createDir(path: string): Promise<void> {
    return this.withRateLimit(async () => {
      const normalizedPath = this.normalizePath(path);
      const lastSlash = normalizedPath.lastIndexOf("/");
      const dirName = normalizedPath.substring(lastSlash + 1);
      const parentPath = normalizedPath.substring(0, lastSlash);

      const parentItemPath = this.getItemPath(parentPath);
      const url = `${OneDriveDriver.GRAPH_API}${parentItemPath}/children`;

      const response = await this.apiRequest(url, {
        method: "POST",
        body: JSON.stringify({
          name: dirName,
          folder: {},
          "@microsoft.graph.conflictBehavior": "rename",
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OneDrive createDir failed: ${response.status} ${errorText}`);
      }
    });
  }

  /**
   * Delete a directory from OneDrive.
   * Uses the same DELETE endpoint as files.
   */
  async deleteDir(path: string): Promise<void> {
    return this.deleteFile(path);
  }

  /**
   * Check if a directory exists on OneDrive.
   */
  async dirExists(path: string): Promise<boolean> {
    return this.withRateLimit(async () => {
      const itemPath = this.getItemPath(path);
      const url = `${OneDriveDriver.GRAPH_API}${itemPath}?$select=id,folder`;

      const response = await this.apiRequest(url);
      if (!response.ok) {
        return false;
      }

      const data = await response.json() as { folder?: Record<string, unknown> };
      return !!data.folder;
    });
  }

  /**
   * Get storage info from OneDrive.
   * Uses GET /me/drive
   */
  async getStorageInfo(): Promise<{ used: number; total: number; available: number }> {
    return this.withRateLimit(async () => {
      const url = `${OneDriveDriver.GRAPH_API}/me/drive?$select=quota`;

      const response = await this.apiRequest(url);
      if (!response.ok) {
        throw new Error(`OneDrive getStorageInfo failed: ${response.status}`);
      }

      const data = await response.json() as {
        quota?: {
          used?: number;
          total?: number;
          remaining?: number;
        };
      };

      const used = data.quota?.used || 0;
      const total = data.quota?.total || 5368709120;
      const available = data.quota?.remaining || (total - used);
      return { used, total, available };
    });
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    const authStatus = this.getAuthStatus();
    if (authStatus === "authorized") {
      return { healthy: true, message: "OneDrive is connected" };
    }
    if (authStatus === "expired") {
      return { healthy: false, message: "OneDrive authorization expired, please re-authorize" };
    }
    return { healthy: false, message: "OneDrive requires authorization" };
  }
}

/**
 * Microsoft Graph API DriveItem type
 */
interface DriveItem {
  id?: string;
  name?: string;
  size?: number;
  folder?: Record<string, unknown>;
  file?: { mimeType?: string };
  lastModifiedDateTime?: string;
  createdDateTime?: string;
  "@content.downloadUrl"?: string;
  thumbnails?: Array<{ medium?: { url?: string } }>;
}

export const onedriveDriverFactory: StorageDriverFactory = {
  type: "onedrive",
  displayName: "OneDrive",
  description: "Connect to Microsoft OneDrive for file storage and management",
  authType: "oauth",
  configFields: [
    {
      key: "clientId",
      label: "Client ID (Application ID)",
      type: "text",
      required: true,
      placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      helpText: "Azure AD application's Application (client) ID",
    },
    {
      key: "clientSecret",
      label: "Client Secret",
      type: "password",
      required: true,
      placeholder: "••••••••",
      helpText: "Azure AD application's client secret value",
    },
    {
      key: "tenantId",
      label: "Tenant ID",
      type: "text",
      required: false,
      placeholder: "common",
      defaultValue: "common",
      helpText: "Use 'common' for all account types, 'consumers' for personal, 'organizations' for work/school, or a specific tenant GUID",
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
  create: (config) => new OneDriveDriver(config),
};
