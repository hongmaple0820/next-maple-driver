import type { StorageDriver, StorageDriverConfig, StorageDriverFactory, StorageDriverConfigField, FileInfo } from "./types";

interface WebDAVDriverConfig {
  url: string;
  username: string;
  password: string;
  pathPrefix?: string;
}

interface WebDAVResource {
  href: string;
  props: {
    displayname?: string;
    getcontentlength?: number;
    getlastmodified?: string;
    creationdate?: string;
    resourcetype?: { collection?: boolean };
    quotaUsedBytes?: number;
    quotaAvailableBytes?: number;
  };
}

class WebDAVError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "WebDAVError";
    this.status = status;
  }
}

export class WebDAVStorageDriver implements StorageDriver {
  readonly type = "webdav";
  readonly config: StorageDriverConfig;
  private baseUrl: string;
  private authHeader: string;
  private pathPrefix: string;

  constructor(config: StorageDriverConfig) {
    this.config = config;
    const davConfig = config.config as unknown as WebDAVDriverConfig;
    this.baseUrl = davConfig.url.replace(/\/+$/, "");
    this.pathPrefix = (davConfig.pathPrefix || "").replace(/^\/+|\/+$/g, "");

    // Build Basic auth header
    const credentials = `${davConfig.username || ""}:${davConfig.password || ""}`;
    this.authHeader = `Basic ${Buffer.from(credentials).toString("base64")}`;
  }

  /** Build the full URL for a given logical path */
  private getUrl(path: string): string {
    const cleanPath = path.replace(/^\/+/, "");
    const fullPath = this.pathPrefix ? `/${this.pathPrefix}/${cleanPath}` : `/${cleanPath}`;
    return `${this.baseUrl}${fullPath}`;
  }

  /** Build the DAV path (without baseUrl) for PROPFIND href comparisons */
  private getDavPath(path: string): string {
    const cleanPath = path.replace(/^\/+/, "");
    return this.pathPrefix ? `/${this.pathPrefix}/${cleanPath}` : `/${cleanPath}`;
  }

  /** Make an authenticated HTTP request */
  private async request(method: string, url: string, options?: {
    body?: BodyInit | null;
    headers?: Record<string, string>;
    expectStatus?: number[];
  }): Promise<Response> {
    const headers: Record<string, string> = {
      ...options?.headers,
    };

    // Only set auth if we have credentials
    if (this.authHeader !== "Basic ") {
      headers["Authorization"] = this.authHeader;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: options?.body ?? undefined,
    });

    if (options?.expectStatus && !options.expectStatus.includes(response.status)) {
      const text = await response.text().catch(() => "");
      throw new WebDAVError(
        `WebDAV ${method} ${url} failed: ${response.status} ${response.statusText}${text ? ` - ${text.slice(0, 200)}` : ""}`,
        response.status
      );
    }

    return response;
  }

  /** Parse PROPFIND XML response into structured resource list */
  private parseMultistatus(xml: string): WebDAVResource[] {
    const resources: WebDAVResource[] = [];

    // Extract all <response> blocks
    const responseRegex = /<d:response[^>]*>([\s\S]*?)<\/d:response>/gi;
    const propstatRegex = /<d:propstat[^>]*>([\s\S]*?)<\/d:propstat>/gi;

    let responseMatch: RegExpExecArray | null;
    while ((responseMatch = responseRegex.exec(xml)) !== null) {
      const responseBlock = responseMatch[1];

      // Extract href
      const hrefMatch = responseBlock.match(/<d:href[^>]*>([\s\S]*?)<\/d:href>/i);
      const href = hrefMatch ? decodeURIComponent(hrefMatch[1].trim()) : "";

      // Extract props from first successful propstat
      let props: WebDAVResource["props"] = {};
      let propstatMatch: RegExpExecArray | null;
      const propstatBlocks: string[] = [];
      while ((propstatMatch = propstatRegex.exec(responseBlock)) !== null) {
        propstatBlocks.push(propstatMatch[1]);
      }
      propstatRegex.lastIndex = 0;

      for (const block of propstatBlocks) {
        // Check if status is 200 OK
        const statusMatch = block.match(/<d:status[^>]*>([\s\S]*?)<\/d:status>/i);
        if (statusMatch && !statusMatch[1].includes("200")) continue;

        props = {};

        // Resource type (collection = directory)
        const resourcetypeMatch = block.match(/<d:resourcetype[^>]*>([\s\S]*?)<\/d:resourcetype>/i);
        if (resourcetypeMatch) {
          props.resourcetype = { collection: /<d:collection/i.test(resourcetypeMatch[1]) };
        }

        // Content length
        const contentLengthMatch = block.match(/<d:getcontentlength[^>]*>([\s\S]*?)<\/d:getcontentlength>/i);
        if (contentLengthMatch) {
          props.getcontentlength = parseInt(contentLengthMatch[1].trim(), 10);
        }

        // Last modified
        const lastModifiedMatch = block.match(/<d:getlastmodified[^>]*>([\s\S]*?)<\/d:getlastmodified>/i);
        if (lastModifiedMatch) {
          props.getlastmodified = lastModifiedMatch[1].trim();
        }

        // Creation date
        const creationDateMatch = block.match(/<d:creationdate[^>]*>([\s\S]*?)<\/d:creationdate>/i);
        if (creationDateMatch) {
          props.creationdate = creationDateMatch[1].trim();
        }

        // Display name
        const displayNameMatch = block.match(/<d:displayname[^>]*>([\s\S]*?)<\/d:displayname>/i);
        if (displayNameMatch) {
          props.displayname = displayNameMatch[1].trim();
        }

        // Quota used bytes (Nextcloud/ownCloud extension)
        const quotaUsedMatch = block.match(/<d:quota-used-bytes[^>]*>([\s\S]*?)<\/d:quota-used-bytes>/i)
          || block.match(/<nc:quota-used-bytes[^>]*>([\s\S]*?)<\/nc:quota-used-bytes>/i);
        if (quotaUsedMatch) {
          props.quotaUsedBytes = parseInt(quotaUsedMatch[1].trim(), 10);
        }

        // Quota available bytes (Nextcloud/ownCloud extension)
        const quotaAvailMatch = block.match(/<d:quota-available-bytes[^>]*>([\s\S]*?)<\/d:quota-available-bytes>/i)
          || block.match(/<nc:quota-available-bytes[^>]*>([\s\S]*?)<\/nc:quota-available-bytes>/i);
        if (quotaAvailMatch) {
          props.quotaAvailableBytes = parseInt(quotaAvailMatch[1].trim(), 10);
        }

        break; // Use first successful propstat
      }

      resources.push({ href, props });
    }

    return resources;
  }

  /** PROPFIND - get properties of a resource or list directory contents */
  private async propfind(path: string, depth: 0 | 1 = 1): Promise<WebDAVResource[]> {
    const url = this.getUrl(path);
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:resourcetype/>
    <d:getcontentlength/>
    <d:getlastmodified/>
    <d:creationdate/>
    <d:displayname/>
    <d:quota-used-bytes/>
    <d:quota-available-bytes/>
  </d:prop>
</d:propfind>`;

    const response = await this.request("PROPFIND", url, {
      body,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        Depth: String(depth),
      },
      expectStatus: [207],
    });

    const xml = await response.text();
    return this.parseMultistatus(xml);
  }

  /** MKCOL - create a directory (collection) */
  private async mkcol(path: string): Promise<void> {
    const url = this.getUrl(path);
    await this.request("MKCOL", url, {
      expectStatus: [201, 405], // 405 = already exists
    });
  }

  /** Ensure parent directories exist for a given path */
  private async ensureParentDirs(path: string): Promise<void> {
    const parts = path.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
    // Build up path incrementally and create directories
    for (let i = 1; i < parts.length; i++) {
      const dirPath = "/" + parts.slice(0, i).join("/");
      try {
        await this.mkcol(dirPath);
      } catch {
        // Directory may already exist, which is fine
      }
    }
  }

  /** Extract basename from a WebDAV href */
  private basenameFromHref(href: string): string {
    const clean = href.replace(/\/+$/, "");
    const lastSegment = clean.split("/").pop() || "";
    return decodeURIComponent(lastSegment);
  }

  async writeFile(path: string, data: Buffer): Promise<void> {
    // Ensure parent directory exists
    const parentPath = path.includes("/") ? path.substring(0, path.lastIndexOf("/")) : "/";
    if (parentPath && parentPath !== "/") {
      await this.ensureParentDirs(parentPath);
    }

    const url = this.getUrl(path);
    await this.request("PUT", url, {
      body: new Uint8Array(data),
      headers: {
        "Content-Type": "application/octet-stream",
      },
      expectStatus: [200, 201, 204],
    });
  }

  async readFile(path: string): Promise<Buffer> {
    const url = this.getUrl(path);
    const response = await this.request("GET", url, {
      expectStatus: [200],
    });
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Get the download link for a file on WebDAV.
   * Constructs the direct URL to the file on the WebDAV server.
   */
  async getDownloadLink(path: string): Promise<string> {
    return this.getUrl(path);
  }

  async deleteFile(path: string): Promise<void> {
    const url = this.getUrl(path);
    try {
      await this.request("DELETE", url, {
        expectStatus: [200, 204, 404],
      });
    } catch {
      // File might already be deleted
    }
  }

  async fileExists(path: string): Promise<boolean> {
    try {
      const url = this.getUrl(path);
      await this.request("HEAD", url, {
        expectStatus: [200],
      });
      return true;
    } catch {
      return false;
    }
  }

  async getFileSize(path: string): Promise<number> {
    const resources = await this.propfind(path, 0);
    if (resources.length > 0) {
      return resources[0].props.getcontentlength ?? 0;
    }
    return 0;
  }

  async createDir(path: string): Promise<void> {
    try {
      // Ensure parent directories exist
      const parentPath = path.includes("/") ? path.substring(0, path.lastIndexOf("/")) : "/";
      if (parentPath && parentPath !== "/") {
        await this.ensureParentDirs(parentPath);
      }
      await this.mkcol(path);
    } catch {
      // Directory might already exist
    }
  }

  async deleteDir(path: string): Promise<void> {
    const url = this.getUrl(path);
    try {
      await this.request("DELETE", url, {
        expectStatus: [200, 204, 404],
      });
    } catch {
      // Directory might already be deleted
    }
  }

  async dirExists(path: string): Promise<boolean> {
    try {
      const resources = await this.propfind(path, 0);
      if (resources.length > 0) {
        return resources[0].props.resourcetype?.collection === true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async listDir(path: string): Promise<FileInfo[]> {
    try {
      const resources = await this.propfind(path, 1);
      const dirPath = this.getDavPath(path).replace(/\/+$/, "");
      const results: FileInfo[] = [];

      for (const resource of resources) {
        // Normalize href - remove trailing slash for comparison
        const href = resource.href.replace(/\/+$/, "");

        // Skip the directory itself (href will match the requested path)
        if (href === dirPath || href === dirPath + "/") continue;

        // Also skip if the href after base URL matches the path prefix + path
        const urlObj = new URL(resource.href.startsWith("http") ? resource.href : `${this.baseUrl}${resource.href.startsWith("/") ? "" : "/"}${resource.href}`);
        const urlPath = urlObj.pathname.replace(/\/+$/, "");
        if (urlPath === dirPath) continue;

        // Extract the name
        const name = this.basenameFromHref(href);
        if (!name) continue;

        // Check if it's a directory
        const isDir = resource.props.resourcetype?.collection === true || href.endsWith("/");

        results.push({
          name,
          size: resource.props.getcontentlength ?? 0,
          isDir,
          lastModified: resource.props.getlastmodified ? new Date(resource.props.getlastmodified) : undefined,
          created: resource.props.creationdate ? new Date(resource.props.creationdate) : undefined,
        });
      }

      return results;
    } catch {
      return [];
    }
  }

  async getPublicUrl(path: string): Promise<string> {
    const fullPath = this.getPath(path);
    return `${this.baseUrl}${fullPath}`;
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    try {
      // Try to do a PROPFIND on the root path to verify connectivity
      const rootPath = this.pathPrefix ? `/${this.pathPrefix}` : "/";
      await this.propfind(rootPath, 0);
      return { healthy: true, message: "WebDAV server is accessible" };
    } catch (e) {
      const err = e as WebDAVError;
      if (err.status === 401) {
        return { healthy: false, message: "WebDAV authentication failed: invalid credentials" };
      }
      if (err.status === 404) {
        // Server is reachable but path doesn't exist - still "healthy" in terms of connectivity
        return { healthy: true, message: "WebDAV server reachable (root path not found, may need initialization)" };
      }
      return { healthy: false, message: `WebDAV error: ${err.message}` };
    }
  }

  async getStorageInfo(): Promise<{ used: number; total: number; available: number }> {
    try {
      // Try to get quota information from the root PROPFIND
      // Some WebDAV servers (Nextcloud, ownCloud) support quota reporting
      const rootPath = this.pathPrefix ? `/${this.pathPrefix}` : "/";
      const resources = await this.propfind(rootPath, 0);

      if (resources.length > 0) {
        const props = resources[0].props;
        if (props.quotaUsedBytes !== undefined && props.quotaAvailableBytes !== undefined) {
          const used = props.quotaUsedBytes;
          const available = props.quotaAvailableBytes;
          const total = used + available;
          return { used, total, available };
        }
      }

      // Fallback: estimate used storage by recursively listing and summing file sizes
      const used = await this.estimateUsedStorage(rootPath);
      return { used, total: 0, available: 0 };
    } catch {
      return { used: 0, total: 0, available: 0 };
    }
  }

  /** Estimate used storage by listing all files recursively (up to a limit) */
  private async estimateUsedStorage(path: string, maxDepth: number = 3): Promise<number> {
    if (maxDepth <= 0) return 0;

    let totalSize = 0;
    try {
      const resources = await this.propfind(path, 1);
      const dirPath = this.getDavPath(path).replace(/\/+$/, "");

      for (const resource of resources) {
        const href = resource.href.replace(/\/+$/, "");
        const urlPath = new URL(resource.href.startsWith("http") ? resource.href : `${this.baseUrl}${resource.href.startsWith("/") ? "" : "/"}${resource.href}`).pathname.replace(/\/+$/, "");
        if (urlPath === dirPath) continue;

        const isDir = resource.props.resourcetype?.collection === true || href.endsWith("/");
        if (isDir) {
          const name = this.basenameFromHref(href);
          if (name) {
            const subPath = path.replace(/\/+$/, "") + "/" + name;
            totalSize += await this.estimateUsedStorage(subPath, maxDepth - 1);
          }
        } else {
          totalSize += resource.props.getcontentlength ?? 0;
        }
      }
    } catch {
      // Ignore errors in estimation
    }

    return totalSize;
  }

  /** Get the full DAV path for a given logical path (used by getPublicUrl) */
  private getPath(path: string): string {
    const cleanPath = path.replace(/^\/+/, "");
    return this.pathPrefix ? `/${this.pathPrefix}/${cleanPath}` : `/${cleanPath}`;
  }
}

export const webdavDriverFactory: StorageDriverFactory = {
  type: "webdav",
  displayName: "WebDAV",
  description: "Connect to WebDAV servers like Nextcloud, ownCloud, or any WebDAV-compatible service",
  configFields: [
    {
      key: "url",
      label: "Server URL",
      type: "url",
      required: true,
      placeholder: "https://nextcloud.example.com/remote.php/dav/files/user/",
      helpText: "Full WebDAV endpoint URL",
    },
    {
      key: "username",
      label: "Username",
      type: "text",
      required: true,
      placeholder: "user@example.com",
    },
    {
      key: "password",
      label: "Password / App Password",
      type: "password",
      required: true,
      placeholder: "••••••••",
      helpText: "Use an app-specific password if 2FA is enabled",
    },
    {
      key: "pathPrefix",
      label: "Path Prefix",
      type: "text",
      required: false,
      placeholder: "clouddrive",
      helpText: "Optional subdirectory within the WebDAV root",
    },
  ],
  create: (config) => new WebDAVStorageDriver(config),
};
