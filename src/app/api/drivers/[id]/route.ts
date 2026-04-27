import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { invalidateMountCache } from '@/lib/vfs';
import { invalidateDriver } from '@/lib/storage-drivers/manager';

/**
 * Mask sensitive token values for API responses
 */
function maskDriverFields(driver: Record<string, unknown>) {
  return {
    id: driver.id,
    name: driver.name,
    type: driver.type,
    basePath: driver.basePath,
    status: driver.status,
    isDefault: driver.isDefault,
    isEnabled: driver.isEnabled,
    priority: driver.priority,
    mountPath: driver.mountPath,
    isReadOnly: driver.isReadOnly,
    config: driver.config,
    authType: driver.authType,
    authStatus: driver.authStatus,
    accessToken: driver.accessToken ? '••••••••' : null,
    refreshToken: driver.refreshToken ? '••••••••' : null,
    tokenExpiresAt: driver.tokenExpiresAt instanceof Date
      ? driver.tokenExpiresAt.toISOString()
      : (driver.tokenExpiresAt as string | null),
    lastSyncAt: driver.lastSyncAt instanceof Date
      ? driver.lastSyncAt.toISOString()
      : (driver.lastSyncAt as string | null),
    createdAt: driver.createdAt instanceof Date
      ? driver.createdAt.toISOString()
      : (driver.createdAt as string),
    updatedAt: driver.updatedAt instanceof Date
      ? driver.updatedAt.toISOString()
      : (driver.updatedAt as string),
  };
}

/**
 * GET /api/drivers/[id] - Get single driver details with masked tokens
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { id } = await params;
    const driver = await db.storageDriver.findUnique({ where: { id } });

    if (!driver) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
    }

    return NextResponse.json({
      driver: maskDriverFields(driver as unknown as Record<string, unknown>),
    });
  } catch (error) {
    console.error('Error getting driver:', error);
    return NextResponse.json({ error: 'Failed to get driver' }, { status: 500 });
  }
}

/**
 * PUT /api/drivers/[id] - Update driver config
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    const existing = await db.storageDriver.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
    }

    const {
      name,
      status,
      priority,
      basePath,
      config,
      mountPath,
      isReadOnly,
      isEnabled,
    } = body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (status !== undefined) updateData.status = status;
    if (priority !== undefined) updateData.priority = priority;
    if (basePath !== undefined) updateData.basePath = basePath;
    if (config !== undefined) updateData.config = typeof config === 'string' ? config : JSON.stringify(config);
    if (mountPath !== undefined) updateData.mountPath = mountPath;
    if (isReadOnly !== undefined) updateData.isReadOnly = isReadOnly;
    if (isEnabled !== undefined) updateData.isEnabled = isEnabled;

    const driver = await db.storageDriver.update({
      where: { id },
      data: updateData,
    });

    // Invalidate driver instance cache and VFS mount cache
    invalidateDriver(id);
    invalidateMountCache();

    return NextResponse.json({
      driver: maskDriverFields(driver as unknown as Record<string, unknown>),
    });
  } catch (error) {
    console.error('Error updating driver:', error);
    return NextResponse.json({ error: 'Failed to update driver' }, { status: 500 });
  }
}

/**
 * DELETE /api/drivers/[id] - Delete a driver (and invalidate cache)
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { id } = await params;

    const existing = await db.storageDriver.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
    }

    if (existing.isDefault) {
      return NextResponse.json(
        { error: 'Cannot delete the default driver' },
        { status: 400 }
      );
    }

    await db.storageDriver.delete({ where: { id } });

    // Invalidate driver instance cache and VFS mount cache
    invalidateDriver(id);
    invalidateMountCache();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting driver:', error);
    return NextResponse.json({ error: 'Failed to delete driver' }, { status: 500 });
  }
}
