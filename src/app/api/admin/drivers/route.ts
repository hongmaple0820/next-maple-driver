import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { existsSync } from 'fs';
import { getDriverFactory } from '@/lib/storage-drivers';
import { invalidateMountCache } from '@/lib/vfs';

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as Record<string, unknown>).role !== 'admin') {
    return null;
  }
  return session;
}

// GET /api/admin/drivers - List all storage drivers
export async function GET() {
  try {
    const session = await requireAdmin();
    if (!session) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const drivers = await db.storageDriver.findMany({
      orderBy: [{ isDefault: 'desc' }, { priority: 'desc' }],
    });

    const driversWithHealth = drivers.map((driver) => ({
      id: driver.id,
      name: driver.name,
      type: driver.type,
      status: driver.status,
      priority: driver.priority,
      isDefault: driver.isDefault,
      config: driver.config,
      basePath: driver.basePath,
      mountPath: driver.mountPath,
      isReadOnly: driver.isReadOnly,
      authType: driver.authType,
      authStatus: driver.authStatus,
      accessToken: driver.accessToken ? '••••••••' : null, // Mask in listing
      refreshToken: driver.refreshToken ? '••••••••' : null,
      tokenExpiresAt: driver.tokenExpiresAt?.toISOString() || null,
      lastSyncAt: driver.lastSyncAt?.toISOString() || null,
      createdAt: driver.createdAt.toISOString(),
      updatedAt: driver.updatedAt.toISOString(),
      healthy: driver.type === 'local' ? existsSync(driver.basePath || './storage') : false,
    }));

    // If no drivers exist, return the default local driver info
    if (drivers.length === 0) {
      return NextResponse.json({
        drivers: driversWithHealth,
        defaultDriver: {
          id: 'default-local',
          name: 'Local Storage (Default)',
          type: 'local',
          status: 'active',
          isDefault: true,
          basePath: './storage',
          healthy: existsSync('./storage'),
        },
      });
    }

    return NextResponse.json({ drivers: driversWithHealth });
  } catch (error) {
    console.error('Error listing drivers:', error);
    return NextResponse.json({ error: 'Failed to list drivers' }, { status: 500 });
  }
}

// POST /api/admin/drivers - Create a new storage driver
export async function POST(request: NextRequest) {
  try {
    const session = await requireAdmin();
    if (!session) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { name, type, basePath, priority, isDefault, config, mountPath, isReadOnly } = await request.json();

    if (!name || !type) {
      return NextResponse.json(
        { error: 'Name and type are required' },
        { status: 400 }
      );
    }

    // Validate driver type
    const factory = getDriverFactory(type);
    if (!factory) {
      return NextResponse.json(
        { error: `Unsupported driver type: ${type}. Supported: local, s3, webdav, baidu, aliyun, onedrive, google, 115, quark` },
        { status: 400 }
      );
    }

    // Validate required config fields
    if (config && typeof config === 'object') {
      for (const field of factory.configFields) {
        if (field.required && !config[field.key]) {
          return NextResponse.json(
            { error: `Missing required field: ${field.label}` },
            { status: 400 }
          );
        }
      }
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await db.storageDriver.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    // Mask sensitive fields in stored config
    const safeConfig = { ...(config || {}) };
    if (type === 's3') {
      // Keep accessKeyId but mask secretAccessKey for storage
      // We still store the full secret for actual use
    }

    const driver = await db.storageDriver.create({
      data: {
        name,
        type,
        basePath: basePath || '',
        priority: priority || 0,
        isDefault: isDefault || false,
        mountPath: mountPath || '',
        isReadOnly: isReadOnly || false,
        config: safeConfig ? JSON.stringify(safeConfig) : '{}',
        status: 'active',
        authType: factory.authType || 'none',
        authStatus: factory.authType ? 'pending' : 'none',
      },
    });

    // Invalidate VFS mount cache after driver changes
    invalidateMountCache();

    return NextResponse.json({
      id: driver.id,
      name: driver.name,
      type: driver.type,
      status: driver.status,
      priority: driver.priority,
      isDefault: driver.isDefault,
      basePath: driver.basePath,
      config: driver.config,
      authType: driver.authType,
      authStatus: driver.authStatus,
      createdAt: driver.createdAt.toISOString(),
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating driver:', error);
    return NextResponse.json({ error: 'Failed to create driver' }, { status: 500 });
  }
}
