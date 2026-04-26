import type {
  StorageDriver,
  StorageDriverConfig,
  OAuthConfig,
  OAuthTokenResponse,
  CloudAuthType,
  CloudAuthStatus,
  FileInfo,
} from "./types";

/**
 * Rate limiter for API calls
 */
class RateLimiter {
  private queue: Array<{ resolve: () => void }> = [];
  private activeCount = 0;
  private lastCallTime = 0;

  constructor(
    private maxConcurrent: number = 5,
    private minIntervalMs: number = 100
  ) {}

  async acquire(): Promise<void> {
    // Enforce minimum interval between calls
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCallTime;
    if (timeSinceLastCall < this.minIntervalMs) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.minIntervalMs - timeSinceLastCall)
      );
    }

    // Enforce max concurrent
    if (this.activeCount >= this.maxConcurrent) {
      await new Promise<void>((resolve) => {
        this.queue.push({ resolve });
      });
    }

    this.activeCount++;
    this.lastCallTime = Date.now();
  }

  release(): void {
    this.activeCount--;
    const next = this.queue.shift();
    if (next) {
      this.activeCount++;
      this.lastCallTime = Date.now();
      next.resolve();
    }
  }
}

/**
 * Abstract base class for third-party cloud drive drivers.
 * Provides common OAuth flow, token management, rate limiting,
 * and stub implementations for the StorageDriver interface.
 */
export abstract class CloudDriverBase implements StorageDriver {
  readonly type: string;
  readonly config: StorageDriverConfig;

  protected rateLimiter: RateLimiter;
  protected accessToken: string;
  protected refreshToken: string;
  protected tokenExpiresAt: Date | null;

  constructor(config: StorageDriverConfig) {
    this.config = config;
    this.type = config.type;
    this.accessToken = config.accessToken || config.config.accessToken || "";
    this.refreshToken = config.refreshToken || config.config.refreshToken || "";
    this.tokenExpiresAt = config.tokenExpiresAt || null;
    this.rateLimiter = new RateLimiter(this.getMaxConcurrent(), this.getMinInterval());
  }

  // --- Abstract methods for subclasses to implement ---

  /** Get the OAuth configuration for this driver */
  abstract getOAuthConfig(): OAuthConfig;

  /** Get the maximum concurrent API calls */
  protected getMaxConcurrent(): number {
    return 5;
  }

  /** Get the minimum interval between API calls in ms */
  protected getMinInterval(): number {
    return 100;
  }

  // --- OAuth Flow ---

  /**
   * Generate the authorization URL for OAuth2 flow.
   * The user visits this URL to grant access.
   */
  getAuthorizationUrl(state: string): string {
    const oauthConfig = this.getOAuthConfig();
    const params = new URLSearchParams({
      response_type: "code",
      client_id: oauthConfig.clientId,
      redirect_uri: oauthConfig.redirectUri,
      scope: oauthConfig.scopes.join(" "),
      state,
    });

    // Add any extra params specific to this provider
    if (oauthConfig.extraAuthParams) {
      for (const [key, value] of Object.entries(oauthConfig.extraAuthParams)) {
        params.set(key, value);
      }
    }

    return `${oauthConfig.authorizationUrl}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token.
   * Called by the OAuth callback handler.
   */
  async exchangeCodeForToken(code: string): Promise<OAuthTokenResponse> {
    const oauthConfig = this.getOAuthConfig();
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: oauthConfig.clientId,
      client_secret: oauthConfig.clientSecret,
      redirect_uri: oauthConfig.redirectUri,
    });

    if (oauthConfig.extraTokenParams) {
      for (const [key, value] of Object.entries(oauthConfig.extraTokenParams)) {
        params.set(key, value);
      }
    }

    // Stub: In production, this would make an actual HTTP request
    // const response = await fetch(oauthConfig.tokenUrl, {
    //   method: "POST",
    //   headers: { "Content-Type": "application/x-www-form-urlencoded" },
    //   body: params.toString(),
    // });
    // const data = await response.json();

    const mockResponse: OAuthTokenResponse = {
      access_token: `mock_access_${this.type}_${Date.now()}`,
      refresh_token: `mock_refresh_${this.type}_${Date.now()}`,
      expires_in: 2592000, // 30 days
      token_type: "Bearer",
    };

    // Update stored tokens
    this.accessToken = mockResponse.access_token;
    this.refreshToken = mockResponse.refresh_token;
    this.tokenExpiresAt = new Date(Date.now() + mockResponse.expires_in * 1000);

    return mockResponse;
  }

  /**
   * Refresh the access token using the refresh token.
   */
  async refreshAccessToken(): Promise<OAuthTokenResponse> {
    const oauthConfig = this.getOAuthConfig();
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.refreshToken,
      client_id: oauthConfig.clientId,
      client_secret: oauthConfig.clientSecret,
    });

    // Stub: In production, this would make an actual HTTP request
    // const response = await fetch(oauthConfig.tokenUrl, {
    //   method: "POST",
    //   headers: { "Content-Type": "application/x-www-form-urlencoded" },
    //   body: params.toString(),
    // });
    // const data = await response.json();

    const mockResponse: OAuthTokenResponse = {
      access_token: `mock_access_${this.type}_${Date.now()}`,
      refresh_token: this.refreshToken,
      expires_in: 2592000,
      token_type: "Bearer",
    };

    this.accessToken = mockResponse.access_token;
    this.tokenExpiresAt = new Date(Date.now() + mockResponse.expires_in * 1000);

    return mockResponse;
  }

  /**
   * Check if the current access token is expired and refresh if needed.
   */
  async ensureValidToken(): Promise<string> {
    if (!this.tokenExpiresAt || this.tokenExpiresAt <= new Date()) {
      if (this.refreshToken) {
        await this.refreshAccessToken();
      }
    }
    return this.accessToken;
  }

  // --- Authentication Status ---

  getAuthType(): CloudAuthType {
    return this.config.authType || "none";
  }

  getAuthStatus(): CloudAuthStatus {
    if (!this.accessToken && !this.refreshToken) {
      return "pending";
    }
    if (this.tokenExpiresAt && this.tokenExpiresAt <= new Date()) {
      return "expired";
    }
    if (this.accessToken) {
      return "authorized";
    }
    return "pending";
  }

  // --- Rate Limiting ---

  /**
   * Execute an API call with rate limiting.
   * Wraps the actual API call with acquire/release.
   */
  protected async withRateLimit<T>(fn: () => Promise<T>): Promise<T> {
    await this.rateLimiter.acquire();
    try {
      return await fn();
    } finally {
      this.rateLimiter.release();
    }
  }

  // --- Stub implementations for StorageDriver interface ---
  // Subclasses should override these with real implementations

  async writeFile(path: string, data: Buffer): Promise<void> {
    void path; void data;
    // Stub: In production, upload file to cloud provider
    return Promise.resolve();
  }

  async readFile(path: string): Promise<Buffer> {
    void path;
    // Stub: In production, download file from cloud provider
    return Buffer.from(`Mock file content from ${this.type} driver`);
  }

  async deleteFile(path: string): Promise<void> {
    void path;
    // Stub: In production, delete file from cloud provider
    return Promise.resolve();
  }

  async fileExists(path: string): Promise<boolean> {
    void path;
    // Stub: In production, check if file exists on cloud provider
    return false;
  }

  async getFileSize(path: string): Promise<number> {
    void path;
    // Stub: In production, get file size from cloud provider
    return 0;
  }

  async createDir(path: string): Promise<void> {
    void path;
    // Stub: In production, create directory on cloud provider
    return Promise.resolve();
  }

  async deleteDir(path: string): Promise<void> {
    void path;
    // Stub: In production, delete directory from cloud provider
    return Promise.resolve();
  }

  async dirExists(path: string): Promise<boolean> {
    void path;
    // Stub: In production, check if directory exists on cloud provider
    return false;
  }

  async listDir(path: string): Promise<FileInfo[]> {
    void path;
    // Stub: In production, list directory contents from cloud provider
    return [];
  }

  async getPublicUrl(path: string): Promise<string> {
    void path;
    // Stub: In production, generate a public/share URL
    return `https://${this.type}-example.com/shared/${path}`;
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    const authStatus = this.getAuthStatus();
    if (authStatus === "authorized") {
      return { healthy: true, message: `${this.type} driver is connected` };
    }
    if (authStatus === "expired") {
      return { healthy: false, message: `${this.type} driver token is expired` };
    }
    if (authStatus === "pending") {
      return { healthy: false, message: `${this.type} driver requires authorization` };
    }
    return { healthy: false, message: `${this.type} driver has an error` };
  }

  async getStorageInfo(): Promise<{ used: number; total: number; available: number }> {
    // Stub: In production, query cloud provider for storage info
    return { used: 0, total: 0, available: 0 };
  }
}

/**
 * Abstract base class for account/password-based cloud drivers.
 * Provides common authentication via credentials and cookie management.
 */
export abstract class CookieAuthDriver extends CloudDriverBase {
  protected username: string;
  protected password: string;
  protected cookies: string;

  constructor(config: StorageDriverConfig) {
    super(config);
    this.username = config.config.username || config.config.phone || "";
    this.password = config.config.password || "";
    this.cookies = config.config.cookies || "";
  }

  /**
   * Perform login with username/password.
   * Returns cookies on success.
   */
  abstract login(): Promise<string>;

  /**
   * Check if cookies are still valid.
   */
  abstract validateCookies(): Promise<boolean>;

  /**
   * Get auth type as password
   */
  getAuthType(): CloudAuthType {
    return "password";
  }

  /**
   * Override ensureValidToken for cookie-based auth
   */
  async ensureValidToken(): Promise<string> {
    if (!this.cookies) {
      this.cookies = await this.login();
    }
    return this.cookies;
  }

  getAuthStatus(): CloudAuthStatus {
    if (this.cookies) {
      return "authorized";
    }
    if (this.username && this.password) {
      return "pending";
    }
    return "error";
  }
}
