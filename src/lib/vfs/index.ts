import { db } from '@/lib/db';
import { getDriver, getDefaultDriver } from '@/lib/storage-drivers/manager';
import type { StorageDriverConfig, StorageDriver, FileInfo, VFSMountPoint } from '@/lib/storage-drivers/types';

/**
 * Virtual File System (VFS)
 * 
 * Provides a unified file tree that mounts multiple storage drivers
 * at virtual paths. Similar to AList/OpenList architecture.
 * 
 * Mount path examples:
 *   /           -> Root (shows all mount points as folders)
 *   /local      -> Local storage driver
 *   /baidu      -> Baidu Wangpan driver
 *   /s3-backup  -> S3 storage driver
 *   /webdav     -> WebDAV storage driver
 */

// In-memory cache of mount points (refreshed periodically)
let mountCache: VFSMountPoint[] = [];
let mountCacheTime = 0;
const CACHE_TTL = 30000; // 30 seconds

// Resolve a virtual path to a driver and its real path
export interface ResolvedPath {
  mountPoint: VFSMountPoint;
  driver: StorageDriver;
  realPath: string; // The path within the driver
  virtualPath: string; // The original virtual path
}

// Refresh mount cache from database
async function refreshMountCache(): Promise<VFSMountPoint[]> {
  const now = Date.now();
  if (now - mountCacheTime < CACHE_TTL && mountCache.length > 0) {
    return mountCache;
  }

  const drivers = await db.storageDriver.findMany({
    where: { isEnabled: true, status: 'active' },
    orderBy: [{ priority: 'desc' }],
  });

  mountCache = drivers.map(d => ({
    id: d.id,
    driverId: d.id,
    mountPath: d.mountPath || d.basePath || `/${d.type}-${d.id.substring(0, 8)}`,
    driverType: d.type,
    isReadOnly: d.isReadOnly || d.status === 'read-only',
    isEnabled: d.isEnabled,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  }));

  // Always include default local driver
  const hasLocal = mountCache.some(m => m.driverId === 'local-default');
  if (!hasLocal) {
    mountCache.unshift({
      id: 'local-default',
      driverId: 'local-default',
      mountPath: '/local',
      driverType: 'local',
      isReadOnly: false,
      isEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  // Ensure VFSNode exists in DB for local-default mount
  try {
    const localNode = await db.vFSNode.findUnique({ where: { path: '/local' } });
    if (!localNode) {
      await db.vFSNode.create({
        data: {
          name: 'local',
          path: '/local',
          driverId: null,
          driverPath: '/',
          isDir: true,
          isReadOnly: false,
        },
      });
    }
  } catch (e) {
    // Non-critical: DB may not be available yet
    console.warn('Failed to ensure local-default VFSNode:', e);
  }

  mountCacheTime = now;
  return mountCache;
}

// Invalidate mount cache
export function invalidateMountCache(): void {
  mountCacheTime = 0;
  mountCache = [];
}

// Get all mount points
export async function getMountPoints(): Promise<VFSMountPoint[]> {
  return refreshMountCache();
}

// Resolve a virtual path to a specific driver
export async function resolveVirtualPath(virtualPath: string): Promise<ResolvedPath | null> {
  const mounts = await refreshMountCache();

  // Normalize path
  const normalizedPath = '/' + virtualPath.replace(/^\/+/, '').replace(/\/+$/, '');

  if (normalizedPath === '/' || normalizedPath === '') {
    // Root path - no specific driver
    return null;
  }

  // Find the longest matching mount path
  let bestMatch: VFSMountPoint | null = null;
  let bestMatchLength = 0;

  for (const mount of mounts) {
    const mountPath = '/' + mount.mountPath.replace(/^\/+/, '').replace(/\/+$/, '');
    if (normalizedPath === mountPath || normalizedPath.startsWith(mountPath + '/')) {
      if (mountPath.length > bestMatchLength) {
        bestMatch = mount;
        bestMatchLength = mountPath.length;
      }
    }
  }

  if (!bestMatch) {
    return null;
  }

  // Calculate the real path within the driver
  const mountPath = '/' + bestMatch.mountPath.replace(/^\/+/, '').replace(/\/+$/, '');
  const relativePath = normalizedPath.substring(mountPath.length).replace(/^\/+/, '');
  const realPath = relativePath || '/';

  // Get the driver instance
  let driver: StorageDriver;
  if (bestMatch.driverId === 'local-default') {
    driver = getDefaultDriver();
  } else {
    const driverRecord = await db.storageDriver.findUnique({ where: { id: bestMatch.driverId } });
    if (!driverRecord) return null;

    const config: StorageDriverConfig = {
      id: driverRecord.id,
      name: driverRecord.name,
      type: driverRecord.type as StorageDriverConfig['type'],
      config: JSON.parse(driverRecord.config || '{}'),
      isDefault: driverRecord.isDefault,
      isEnabled: driverRecord.isEnabled,
      createdAt: driverRecord.createdAt,
      updatedAt: driverRecord.updatedAt,
      authType: driverRecord.authType as StorageDriverConfig['authType'],
      authStatus: driverRecord.authStatus as StorageDriverConfig['authStatus'],
      accessToken: driverRecord.accessToken || undefined,
      refreshToken: driverRecord.refreshToken || undefined,
      tokenExpiresAt: driverRecord.tokenExpiresAt || undefined,
    };

    driver = getDriver(config);
  }

  return {
    mountPoint: bestMatch,
    driver,
    realPath,
    virtualPath: normalizedPath,
  };
}

// List directory at virtual path
export async function listVirtualDir(virtualPath: string): Promise<FileInfo[]> {
  const normalizedPath = '/' + virtualPath.replace(/^\/+/, '').replace(/\/+$/, '');

  // If at root, return mount points as folders
  if (normalizedPath === '/' || normalizedPath === '') {
    const mounts = await refreshMountCache();
    return mounts.map(mount => ({
      name: mount.mountPath.replace(/^\/+/, '').split('/')[0] || mount.mountPath,
      size: 0,
      isDir: true,
      id: mount.id,
      parentPath: '/',
    }));
  }

  // Resolve to a specific driver
  const resolved = await resolveVirtualPath(normalizedPath);
  if (!resolved) {
    // Check if this is a prefix that matches multiple mounts
    const mounts = await refreshMountCache();
    const matchingMounts = mounts.filter(m => {
      const mountPath = '/' + m.mountPath.replace(/^\/+/, '');
      const prefix = normalizedPath.replace(/^\/+/, '');
      return mountPath.startsWith('/' + prefix + '/') || mountPath === '/' + prefix;
    });

    if (matchingMounts.length > 0) {
      return matchingMounts.map(mount => ({
        name: mount.mountPath.replace(/^\/+/, '').split('/').pop() || mount.mountPath,
        size: 0,
        isDir: true,
        id: mount.id,
        parentPath: normalizedPath,
      }));
    }

    return [];
  }

  // List from the actual driver
  return resolved.driver.listDir(resolved.realPath);
}

// Read file from virtual path
export async function readVirtualFile(virtualPath: string): Promise<Buffer> {
  const resolved = await resolveVirtualPath(virtualPath);
  if (!resolved) throw new Error('Path not found in VFS');
  return resolved.driver.readFile(resolved.realPath);
}

// Write file to virtual path
export async function writeVirtualFile(virtualPath: string, data: Buffer): Promise<void> {
  const resolved = await resolveVirtualPath(virtualPath);
  if (!resolved) throw new Error('Path not found in VFS');
  if (resolved.mountPoint.isReadOnly) throw new Error('Mount point is read-only');
  return resolved.driver.writeFile(resolved.realPath, data);
}

// Delete file at virtual path
export async function deleteVirtualFile(virtualPath: string): Promise<void> {
  const resolved = await resolveVirtualPath(virtualPath);
  if (!resolved) throw new Error('Path not found in VFS');
  if (resolved.mountPoint.isReadOnly) throw new Error('Mount point is read-only');
  return resolved.driver.deleteFile(resolved.realPath);
}

// Get file info at virtual path
export async function getVirtualFileInfo(virtualPath: string): Promise<FileInfo | null> {
  const resolved = await resolveVirtualPath(virtualPath);
  if (!resolved) return null;

  if (resolved.driver.getFileInfo) {
    return resolved.driver.getFileInfo(resolved.realPath);
  }

  // Fallback: check if it exists
  const exists = await resolved.driver.fileExists(resolved.realPath);
  if (!exists) return null;

  return {
    name: virtualPath.split('/').pop() || virtualPath,
    size: await resolved.driver.getFileSize(resolved.realPath),
    isDir: false,
  };
}

// Get download link for virtual path
export async function getVirtualDownloadLink(virtualPath: string): Promise<string | null> {
  const resolved = await resolveVirtualPath(virtualPath);
  if (!resolved) return null;

  if (resolved.driver.getDownloadLink) {
    return resolved.driver.getDownloadLink(resolved.realPath);
  }

  if (resolved.driver.getPublicUrl) {
    return resolved.driver.getPublicUrl(resolved.realPath);
  }

  return null;
}
