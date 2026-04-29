/**
 * Virtual File System (VFS) Module
 *
 * Provides a unified virtual file system that aggregates multiple storage
 * drivers behind mount points. When a user browses a path like /quark/Documents,
 * the VFS resolves the mount point "quark" to the corresponding StorageDriver
 * and delegates the directory listing to that driver.
 *
 * Key responsibilities:
 * - Load mount points from the database (StorageDriver records with mountPath)
 * - Create driver instances using the driver manager
 * - Map virtual paths to driver-specific paths
 * - Cache file listings with a reasonable TTL
 */

import { db } from "@/lib/db";
import { getDriver, invalidateDriver, isCloudDriver } from "@/lib/storage-drivers/manager";
import type {
  StorageDriver,
  StorageDriverConfig,
  FileInfo,
  VFSMountPoint,
  CloudAuthStatus,
} from "@/lib/storage-drivers/types";

// ---------- Types ----------

export interface VFSMountPointInfo {
  id: string;
  driverId: string;
  mountPath: string;
  driverType: string;
  driverName: string;
  isReadOnly: boolean;
  isEnabled: boolean;
  authStatus: string;
  isDefault: boolean;
}

export interface VFSResolvedPath {
  driver: StorageDriver;
  realPath: string;        // The path within the driver (e.g. "/Documents")
  mountPoint: VFSMountPointInfo;
}

export interface VFSListResult {
  path: string;
  items: FileInfo[];
  mountPoint?: VFSMountPointInfo;
}

// ---------- Cache ----------

interface CacheEntry {
  items: FileInfo[];
  expiresAt: number;
}

const CACHE_TTL_MS = 30_000; // 30 seconds

const dirCache = new Map<string, CacheEntry>();

function cacheKey(mountPath: string, driverPath: string): string {
  return `${mountPath}::${driverPath}`;
}

function getCached(key: string): FileInfo[] | null {
  const entry = dirCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    dirCache.delete(key);
    return null;
  }
  return entry.items;
}

function setCache(key: string, items: FileInfo[]): void {
  dirCache.set(key, { items, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Invalidate all cached entries for a given mount path prefix, or all if no prefix given. */
export function invalidateMountCache(mountPath?: string): void {
  if (!mountPath) {
    dirCache.clear();
    return;
  }
  for (const key of dirCache.keys()) {
    if (key.startsWith(mountPath + "::") || key === mountPath + "::/") {
      dirCache.delete(key);
    }
  }
}

// ---------- Helpers ----------

/**
 * Build a StorageDriverConfig from a database StorageDriver record.
 */
function buildDriverConfig(record: {
  id: string;
  name: string;
  type: string;
  basePath: string | null;
  config: string;
  isDefault: boolean;
  isEnabled: boolean;
  authType: string;
  authStatus: string;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  mountPath: string | null;
  isReadOnly: boolean;
}): StorageDriverConfig {
  let parsedConfig: Record<string, string> = {};
  try {
    parsedConfig = JSON.parse(record.config || "{}");
  } catch {
    // ignore bad JSON
  }

  // Merge basePath into config for drivers that need it
  if (record.basePath && !parsedConfig.path) {
    parsedConfig.path = record.basePath;
  }

  return {
    id: record.id,
    name: record.name,
    type: record.type as StorageDriverConfig["type"],
    config: parsedConfig,
    isDefault: record.isDefault,
    isEnabled: record.isEnabled,
    authType: record.authType as StorageDriverConfig["authType"],
    authStatus: record.authStatus as StorageDriverConfig["authStatus"],
    accessToken: record.accessToken || undefined,
    refreshToken: record.refreshToken || undefined,
    tokenExpiresAt: record.tokenExpiresAt || undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Convert a database StorageDriver record into a VFSMountPointInfo.
 */
function toMountPointInfo(record: {
  id: string;
  name: string;
  type: string;
  mountPath: string | null;
  isReadOnly: boolean;
  isEnabled: boolean;
  authStatus: string;
  isDefault: boolean;
}): VFSMountPointInfo {
  const mountPath = record.mountPath && record.mountPath.trim() !== ""
    ? "/" + record.mountPath.replace(/^\/+/, "").replace(/\/+$/, "")
    : "/" + record.type;

  return {
    id: record.id,
    driverId: record.id,
    mountPath,
    driverType: record.type,
    driverName: record.name,
    isReadOnly: record.isReadOnly,
    isEnabled: record.isEnabled,
    authStatus: record.authStatus,
    isDefault: record.isDefault,
  };
}

// ---------- Public API ----------

/**
 * Get all mount points from the database.
 * Returns only enabled drivers that have a mountPath configured
 * (or cloud drivers which get an automatic mount path based on type).
 */
export async function getMountPoints(): Promise<VFSMountPointInfo[]> {
  const drivers = await db.storageDriver.findMany({
    where: {
      isEnabled: true,
      status: "active",
    },
    orderBy: [{ priority: "desc" }, { name: "asc" }],
  });

  return drivers
    .filter((d) => {
      // Include if it has a mountPath, or if it's a cloud driver type
      // (cloud drivers get an auto-generated mount path based on type)
      const hasMountPath = d.mountPath && d.mountPath.trim() !== "";
      const isCloud = isCloudDriver(d.type);
      return hasMountPath || isCloud;
    })
    .map(toMountPointInfo);
}

/**
 * Resolve a virtual path to a driver + real path within that driver.
 *
 * For example, given virtualPath = "/quark/Documents":
 *   - Find the mount point whose mountPath matches "/quark" (longest prefix match)
 *   - Strip the mount prefix to get the driver-relative path "/Documents"
 *   - Create or retrieve the driver instance
 *   - Return the driver + real path
 */
export async function resolveVirtualPath(virtualPath: string): Promise<VFSResolvedPath | null> {
  const normalizedPath = "/" + virtualPath.replace(/^\/+/, "").replace(/\/+$/, "");
  const mounts = await getMountPoints();

  // Find the longest matching mount point (most specific first)
  let bestMatch: VFSMountPointInfo | null = null;
  let bestMatchLength = -1;

  for (const mount of mounts) {
    const mp = mount.mountPath;
    if (
      (normalizedPath === mp || normalizedPath.startsWith(mp + "/")) &&
      mp.length > bestMatchLength
    ) {
      bestMatch = mount;
      bestMatchLength = mp.length;
    }
  }

  if (!bestMatch) return null;

  // Compute the driver-relative path
  const relativePath = normalizedPath.slice(bestMatchLength) || "/";
  const realPath = "/" + relativePath.replace(/^\/+/, "");

  // Get the driver config from the database
  const driverRecord = await db.storageDriver.findUnique({
    where: { id: bestMatch.driverId },
  });

  if (!driverRecord) return null;

  // Check auth status for cloud drivers
  if (isCloudDriver(driverRecord.type)) {
    const authStatus = driverRecord.authStatus as CloudAuthStatus;
    if (authStatus === "pending" || authStatus === "error") {
      // Return the mount info but throw an error so the API can handle it
      const err = new Error(
        authStatus === "pending"
          ? `${bestMatch.driverName} 需要先完成授权才能浏览文件`
          : `${bestMatch.driverName} 授权出错，请重新授权`
      );
      (err as Error & { code: string }).code = "AUTH_REQUIRED";
      (err as Error & { mountPoint: VFSMountPointInfo }).mountPoint = bestMatch;
      throw err;
    }
    if (authStatus === "expired") {
      const err = new Error(`${bestMatch.driverName} 授权已过期，请重新授权`);
      (err as Error & { code: string }).code = "AUTH_EXPIRED";
      (err as Error & { mountPoint: VFSMountPointInfo }).mountPoint = bestMatch;
      throw err;
    }
  }

  // Invalidate cached driver if auth status changed (e.g., new token)
  invalidateDriver(driverRecord.id);

  const config = buildDriverConfig(driverRecord);
  const driver = await getDriver(config);

  return {
    driver,
    realPath,
    mountPoint: bestMatch,
  };
}

/**
 * List the contents of a virtual directory.
 * If the path is "/" (root), returns the list of mount points.
 * Otherwise, resolves the path to a driver and calls its listDir().
 */
export async function listVirtualDir(virtualPath: string): Promise<VFSListResult> {
  const normalizedPath = "/" + virtualPath.replace(/^\/+/, "").replace(/\/+$/, "");

  // Root: return mount points as virtual directories
  if (normalizedPath === "/" || normalizedPath === "") {
    const mounts = await getMountPoints();
    const items: FileInfo[] = mounts.map((m) => ({
      name: m.mountPath.replace(/^\/+/, "").split("/")[0] || m.mountPath,
      size: 0,
      isDir: true,
      lastModified: new Date(),
      id: m.driverId,
    }));
    return { path: "/", items };
  }

  // Check cache first
  const resolved = await resolveVirtualPath(normalizedPath);
  if (!resolved) {
    return { path: normalizedPath, items: [] };
  }

  const ck = cacheKey(resolved.mountPoint.mountPath, resolved.realPath);
  const cached = getCached(ck);
  if (cached) {
    return { path: normalizedPath, items: cached, mountPoint: resolved.mountPoint };
  }

  // Call the driver
  const items = await resolved.driver.listDir(resolved.realPath);
  setCache(ck, items);

  return { path: normalizedPath, items, mountPoint: resolved.mountPoint };
}

/**
 * Read a virtual file (delegates to the driver).
 */
export async function readVirtualFile(virtualPath: string): Promise<Buffer> {
  const resolved = await resolveVirtualPath(virtualPath);
  if (!resolved) throw new Error("Path not found");
  return resolved.driver.readFile(resolved.realPath);
}

/**
 * Write a virtual file (delegates to the driver).
 */
export async function writeVirtualFile(virtualPath: string, data: Buffer): Promise<void> {
  const resolved = await resolveVirtualPath(virtualPath);
  if (!resolved) throw new Error("Mount point not found");
  if (resolved.mountPoint.isReadOnly) throw new Error("Mount point is read-only");
  await resolved.driver.writeFile(resolved.realPath, data);
  invalidateMountCache(resolved.mountPoint.mountPath);
}

/**
 * Delete a virtual file (delegates to the driver).
 */
export async function deleteVirtualFile(virtualPath: string): Promise<void> {
  const resolved = await resolveVirtualPath(virtualPath);
  if (!resolved) throw new Error("Mount point not found");
  if (resolved.mountPoint.isReadOnly) throw new Error("Mount point is read-only");

  // Check if the path is a directory or file
  const fileInfo = resolved.driver.getFileInfo
    ? await resolved.driver.getFileInfo(resolved.realPath)
    : null;

  if (fileInfo?.isDir) {
    await resolved.driver.deleteDir(resolved.realPath);
  } else {
    await resolved.driver.deleteFile(resolved.realPath);
  }

  invalidateMountCache(resolved.mountPoint.mountPath);
}

/**
 * Get file info for a virtual path.
 */
export async function getVirtualFileInfo(virtualPath: string): Promise<FileInfo | null> {
  const resolved = await resolveVirtualPath(virtualPath);
  if (!resolved) return null;

  if (resolved.driver.getFileInfo) {
    return resolved.driver.getFileInfo(resolved.realPath);
  }
  return null;
}

/**
 * Get a download link for a virtual file.
 */
export async function getVirtualDownloadLink(virtualPath: string): Promise<string | null> {
  const resolved = await resolveVirtualPath(virtualPath);
  if (!resolved) return null;

  if (resolved.driver.getDownloadLink) {
    return resolved.driver.getDownloadLink(resolved.realPath);
  }
  return null;
}
