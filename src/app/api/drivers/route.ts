import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDriverFactory } from '@/lib/storage-drivers/manager';
import { invalidateMountCache } from '@/lib/vfs';

/**
 * Mask sensitive token values for API responses
 */
function maskDriver(driver: Record<string, unknown>) {
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
 * GET /api/drivers - List all storage drivers for the current user
 * Shows type, name, authStatus, mountPath, etc. with masked tokens.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const drivers = await db.storageDriver.findMany({
      orderBy: [{ isDefault: 'desc' }, { priority: 'desc' }],
    });

    const maskedDrivers = drivers.map((driver) =>
      maskDriver(driver as unknown as Record<string, unknown>)
    );

    return NextResponse.json({ drivers: maskedDrivers });
  } catch (error) {
    console.error('Error listing user drivers:', error);
    return NextResponse.json({ error: 'Failed to list drivers' }, { status: 500 });
  }
}

/**
 * POST /api/drivers - Create a new storage driver for the current user
 * Accept: name, type, config (object with driver-specific fields), mountPath
 * Auto-sets authType from the factory.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { name, type, config, mountPath, isReadOnly, basePath, priority } = body;

    if (!name || !type) {
      return NextResponse.json(
        { error: 'Name and type are required' },
        { status: 400 }
      );
    }

    // Validate driver type
    const factory = await getDriverFactory(type);
    if (!factory) {
      return NextResponse.json(
        {
          error: `Unsupported driver type: ${type}. Supported: local, s3, webdav, ftp, mount, baidu, aliyun, onedrive, google, 115, quark`,
        },
        { status: 400 }
      );
    }

    // Validate required config fields
    const driverConfig = config || {};
    if (typeof driverConfig === 'object') {
      for (const field of factory.configFields) {
        if (field.required && !driverConfig[field.key]) {
          return NextResponse.json(
            { error: `Missing required field: ${field.label}` },
            { status: 400 }
          );
        }
      }
    }

    // Create the driver record
    const driver = await db.storageDriver.create({
      data: {
        name,
        type,
        basePath: basePath || '',
        priority: priority || 0,
        isDefault: false,
        mountPath: mountPath || '',
        isReadOnly: isReadOnly || false,
        config: JSON.stringify(driverConfig),
        status: 'active',
        authType: factory.authType || 'none',
        authStatus: factory.authType ? 'pending' : 'none',
      },
    });

    // Auto-create VFS mount for this driver
    const finalMountPath = body.mountPath || `/${driver.type}-${driver.id.substring(0, 8)}`;
    await db.vFSNode.upsert({
      where: { path: finalMountPath },
      update: {
        driverId: driver.id,
        driverPath: '/',
        name: finalMountPath.split('/').pop() || driver.name,
        isReadOnly: isReadOnly || false,
      },
      create: {
        name: finalMountPath.split('/').pop() || driver.name,
        path: finalMountPath,
        driverId: driver.id,
        driverPath: '/',
        isDir: true,
        isReadOnly: isReadOnly || false,
      },
    });

    // Also update the driver's mountPath
    await db.storageDriver.update({
      where: { id: driver.id },
      data: { mountPath: finalMountPath },
    });

    // Invalidate VFS mount cache after driver changes
    invalidateMountCache();

    return NextResponse.json(
      {
        id: driver.id,
        name: driver.name,
        type: driver.type,
        status: driver.status,
        priority: driver.priority,
        isDefault: driver.isDefault,
        basePath: driver.basePath,
        mountPath: finalMountPath,
        isReadOnly: driver.isReadOnly,
        config: driver.config,
        authType: driver.authType,
        authStatus: driver.authStatus,
        createdAt: driver.createdAt.toISOString(),
        updatedAt: driver.updatedAt.toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating driver:', error);
    return NextResponse.json({ error: 'Failed to create driver' }, { status: 500 });
  }
}
