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

  constructor(config: StorageDriverConfig) {
    super(config);
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

  // --- Google Drive-specific API stubs ---

  /**
   * List files in a directory on Google Drive.
   * Uses Drive API: files.list with q parameter
   */
  async listDir(path: string): Promise<FileInfo[]> {
    return this.withRateLimit(async () => {
      // Stub: In production, call Google Drive API
      // GET https://www.googleapis.com/drive/v3/files?q='{parentId}'+in+parents
      void path;
      return [];
    });
  }

  /**
   * Upload a file to Google Drive.
   * For small files: simple upload (multipart)
   * For large files: resumable upload
   */
  async writeFile(path: string, data: Buffer): Promise<void> {
    return this.withRateLimit(async () => {
      // Stub: In production, upload via Google Drive API
      // Simple: POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart
      // Resumable: POST ...?uploadType=resumable
      void path; void data;
    });
  }

  /**
   * Download a file from Google Drive.
   * Uses Drive API: files.get with alt=media
   */
  async readFile(path: string): Promise<Buffer> {
    return this.withRateLimit(async () => {
      // Stub: In production, download via Google Drive API
      // GET https://www.googleapis.com/drive/v3/files/{fileId}?alt=media
      void path;
      return Buffer.from("Mock Google Drive file content");
    });
  }

  async deleteFile(path: string): Promise<void> {
    return this.withRateLimit(async () => {
      // Stub: DELETE https://www.googleapis.com/drive/v3/files/{fileId}
      void path;
    });
  }

  async fileExists(path: string): Promise<boolean> {
    return this.withRateLimit(async () => {
      // Stub: GET files.list with name query
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
      // Stub: POST https://www.googleapis.com/drive/v3/files
      // Body: { name: "dirname", mimeType: "application/vnd.google-apps.folder", parents: [...] }
      void path;
    });
  }

  async deleteDir(path: string): Promise<void> {
    return this.withRateLimit(async () => {
      // Stub: DELETE https://www.googleapis.com/drive/v3/files/{fileId}
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
      // Stub: In production, call about.get API
      // GET https://www.googleapis.com/drive/v3/about?fields=storageQuota
      // Google Drive free tier: 15GB
      return { used: 0, total: 16106127360, available: 16106127360 }; // 15GB
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
