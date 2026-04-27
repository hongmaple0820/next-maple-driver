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

    const response = await fetch(oauthConfig.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OAuth token exchange failed: ${response.status} ${errorText}`);
    }

    const data = await response.json() as OAuthTokenResponse;

    // Update stored tokens
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token || this.refreshToken;
    this.tokenExpiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000);

    return data;
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

    const response = await fetch(oauthConfig.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OAuth token refresh failed: ${response.status} ${errorText}`);
    }

    const data = await response.json() as OAuthTokenResponse;

    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token || this.refreshToken;
    this.tokenExpiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000);

    return data;
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

  /**
   * Make an authenticated API request with automatic token refresh.
   * Subclasses should use this for all API calls.
   */
  protected async apiRequest(url: string, options: RequestInit = {}): Promise<Response> {
    const token = await this.ensureValidToken();
    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${token}`);
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
      // Token expired, try to refresh
      await this.refreshAccessToken();
      const newToken = this.accessToken;
      headers.set("Authorization", `Bearer ${newToken}`);
      return fetch(url, { ...options, headers });
    }

    return response;
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
    throw new Error(`writeFile not implemented for ${this.type} driver`);
  }

  async readFile(path: string): Promise<Buffer> {
    void path;
    throw new Error(`readFile not implemented for ${this.type} driver`);
  }

  async deleteFile(path: string): Promise<void> {
    void path;
    throw new Error(`deleteFile not implemented for ${this.type} driver`);
  }

  async fileExists(path: string): Promise<boolean> {
    void path;
    throw new Error(`fileExists not implemented for ${this.type} driver`);
  }

  async getFileSize(path: string): Promise<number> {
    void path;
    throw new Error(`getFileSize not implemented for ${this.type} driver`);
  }

  async createDir(path: string): Promise<void> {
    void path;
    throw new Error(`createDir not implemented for ${this.type} driver`);
  }

  async deleteDir(path: string): Promise<void> {
    void path;
    throw new Error(`deleteDir not implemented for ${this.type} driver`);
  }

  async dirExists(path: string): Promise<boolean> {
    void path;
    throw new Error(`dirExists not implemented for ${this.type} driver`);
  }

  async listDir(path: string): Promise<FileInfo[]> {
    void path;
    throw new Error(`listDir not implemented for ${this.type} driver`);
  }

  async getPublicUrl(path: string): Promise<string> {
    void path;
    throw new Error(`getPublicUrl not implemented for ${this.type} driver`);
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
    throw new Error(`getStorageInfo not implemented for ${this.type} driver`);
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

  /**
   * Make an authenticated API request using cookies.
   * For cookie-based drivers that don't use OAuth tokens.
   */
  protected async cookieRequest(url: string, options: RequestInit = {}): Promise<Response> {
    await this.ensureValidToken();
    const headers = new Headers(options.headers || {});
    headers.set("Cookie", this.cookies);
    headers.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(url, { ...options, headers });

    // If 401 or auth error, try to re-login
    if (response.status === 401 || response.status === 403) {
      this.cookies = await this.login();
      headers.set("Cookie", this.cookies);
      return fetch(url, { ...options, headers });
    }

    return response;
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
