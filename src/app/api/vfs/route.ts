import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, unauthorizedResponse } from '@/lib/auth-helpers';
import { getMountPoints, listVirtualDir, invalidateMountCache } from '@/lib/vfs';
import { db } from '@/lib/db';

// GET /api/vfs - Get mount points or list files at a virtual path
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorizedResponse();

  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  try {
    // Get mount points listing
    if (action === 'mounts') {
      const mounts = await getMountPoints();

      // Enrich with driver names from DB
      const driverIds = mounts.map(m => m.driverId).filter(id => id !== 'local-default');
      const drivers = await db.storageDriver.findMany({
        where: { id: { in: driverIds } },
        select: { id: true, name: true, type: true, status: true, authStatus: true },
      });

      const driverMap = new Map(drivers.map(d => [d.id, d]));

      const enrichedMounts = mounts.map(mount => ({
        ...mount,
        driverName: mount.driverId === 'local-default'
          ? '本地存储'
          : driverMap.get(mount.driverId)?.name || mount.driverType,
        driverStatus: mount.driverId === 'local-default'
          ? 'active'
          : driverMap.get(mount.driverId)?.status || 'unknown',
        authStatus: mount.driverId === 'local-default'
          ? 'authorized'
          : driverMap.get(mount.driverId)?.authStatus || 'pending',
      }));

      return NextResponse.json({ mounts: enrichedMounts });
    }

    // List files at a virtual path
    if (action === 'list') {
      const path = url.searchParams.get('path') || '/';
      const items = await listVirtualDir(path);
      return NextResponse.json({ items, path });
    }

    return NextResponse.json({ error: 'Unknown action. Use ?action=mounts or ?action=list&path=...' }, { status: 400 });
  } catch (error) {
    console.error('VFS root GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}

// POST /api/vfs - Mount a new driver at a virtual path
export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorizedResponse();
  const isAdmin = (user as Record<string, unknown>).role === 'admin';
  if (!isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { driverId, mountPath, isReadOnly } = body;

    if (!driverId) {
      return NextResponse.json({ error: 'driverId is required' }, { status: 400 });
    }
    if (!mountPath) {
      return NextResponse.json({ error: 'mountPath is required' }, { status: 400 });
    }

    // Validate the driver exists
    if (driverId !== 'local-default') {
      const driver = await db.storageDriver.findUnique({ where: { id: driverId } });
      if (!driver) {
        return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
      }
    }

    // Normalize mount path
    const normalizedMountPath = '/' + mountPath.replace(/^\/+/, '').replace(/\/+$/, '');

    // Update the driver's mountPath in the database
    if (driverId !== 'local-default') {
      await db.storageDriver.update({
        where: { id: driverId },
        data: {
          mountPath: normalizedMountPath,
          isReadOnly: isReadOnly ?? false,
        },
      });
    }

    // Create a VFSNode entry for the mount point
    const existingNode = await db.vFSNode.findUnique({ where: { path: normalizedMountPath } });
    if (!existingNode) {
      await db.vFSNode.create({
        data: {
          name: normalizedMountPath.split('/').pop() || 'drive',
          path: normalizedMountPath,
          driverId: driverId === 'local-default' ? null : driverId,
          driverPath: '/',
          isDir: true,
          isReadOnly: isReadOnly ?? false,
        },
      });
    }

    invalidateMountCache();

    return NextResponse.json({ success: true, mountPath: normalizedMountPath, driverId });
  } catch (error) {
    console.error('VFS POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}

// DELETE /api/vfs - Unmount a driver
export async function DELETE(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorizedResponse();
  const isAdmin = (user as Record<string, unknown>).role === 'admin';
  if (!isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const url = new URL(request.url);
    const driverId = url.searchParams.get('driverId');

    if (!driverId) {
      return NextResponse.json({ error: 'driverId is required' }, { status: 400 });
    }

    if (driverId === 'local-default') {
      return NextResponse.json({ error: 'Cannot unmount the default local driver' }, { status: 400 });
    }

    // Clear mount path from the driver
    const driver = await db.storageDriver.findUnique({ where: { id: driverId } });
    if (driver) {
      await db.storageDriver.update({
        where: { id: driverId },
        data: { mountPath: '' },
      });

      // Remove VFSNode entries for this driver
      await db.vFSNode.deleteMany({
        where: { driverId },
      });
    }

    invalidateMountCache();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('VFS DELETE error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
