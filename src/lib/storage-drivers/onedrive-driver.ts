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
 */
export class OneDriveDriver extends CloudDriverBase {
  readonly type = "onedrive";

  // Microsoft Graph API endpoints
  private static readonly GRAPH_API = "https://graph.microsoft.com/v1.0";
  private static readonly GRAPH_API_BETA = "https://graph.microsoft.com/beta";

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

  // --- OneDrive-specific API stubs ---

  /**
   * List files in a directory on OneDrive.
   * Uses Microsoft Graph API: GET /me/drive/root:/{path}:/children
   */
  async listDir(path: string): Promise<FileInfo[]> {
    return this.withRateLimit(async () => {
      // Stub: In production, call Microsoft Graph API
      // GET https://graph.microsoft.com/v1.0/me/drive/root:/{path}:/children
      void path;
      return [];
    });
  }

  /**
   * Upload a file to OneDrive.
   * For files < 4MB: single PUT request
   * For larger files: create upload session (resumable upload)
   */
  async writeFile(path: string, data: Buffer): Promise<void> {
    return this.withRateLimit(async () => {
      // Stub: In production, upload via Graph API
      // Small files: PUT /me/drive/root:/{path}:/content
      // Large files: POST /me/drive/root:/{path}:/createUploadSession
      void path; void data;
    });
  }

  /**
   * Download a file from OneDrive.
   * Uses Microsoft Graph API: GET /me/drive/root:/{path}:/content
   */
  async readFile(path: string): Promise<Buffer> {
    return this.withRateLimit(async () => {
      // Stub: In production, download via Graph API
      // GET https://graph.microsoft.com/v1.0/me/drive/root:/{path}:/content
      void path;
      return Buffer.from("Mock OneDrive file content");
    });
  }

  async deleteFile(path: string): Promise<void> {
    return this.withRateLimit(async () => {
      // Stub: DELETE /me/drive/root:/{path}
      void path;
    });
  }

  async fileExists(path: string): Promise<boolean> {
    return this.withRateLimit(async () => {
      // Stub: GET /me/drive/root:/{path}
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
      // Stub: POST /me/drive/root:/{parent-path}:/children with { "name": "dir", "folder": {} }
      void path;
    });
  }

  async deleteDir(path: string): Promise<void> {
    return this.withRateLimit(async () => {
      // Stub: DELETE /me/drive/root:/{path}
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
      // Stub: In production, call GET /me/drive
      // OneDrive free tier: 5GB
      return { used: 0, total: 5368709120, available: 5368709120 }; // 5GB
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
