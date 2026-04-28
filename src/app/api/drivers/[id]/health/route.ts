import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDriverFactory, invalidateDriver } from '@/lib/storage-drivers/manager';
import { existsSync } from 'fs';
import type { StorageDriverConfig } from '@/lib/storage-drivers/types';

/**
 * GET /api/drivers/[id]/health - Run health check on a specific driver
 * Updates authStatus in DB based on the result.
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

    const driverRecord = await db.storageDriver.findUnique({ where: { id } });
    if (!driverRecord) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
    }

    const startTime = Date.now();

    // Handle local driver with simple file system check
    if (driverRecord.type === 'local' || driverRecord.type === 'mount') {
      const path = driverRecord.basePath || './storage';
      const healthy = existsSync(path);
      const newStatus = healthy ? 'active' : 'error';
      const newAuthStatus = healthy ? 'authorized' : 'error';

      // Update status in DB
      if (driverRecord.status !== newStatus || driverRecord.authStatus !== newAuthStatus) {
        await db.storageDriver.update({
          where: { id },
          data: {
            status: newStatus,
            authStatus: newAuthStatus,
          },
        });
        invalidateDriver(id);
      }

      return NextResponse.json({
        healthy,
        message: healthy
          ? `Local path "${path}" is accessible`
          : `Local path "${path}" is not accessible`,
        responseTime: Date.now() - startTime,
        authStatus: newAuthStatus,
        driverStatus: newStatus,
      });
    }

    // For cloud drivers, use the driver's healthCheck method
    const factory = getDriverFactory(driverRecord.type);
    if (!factory) {
      return NextResponse.json({
        healthy: false,
        message: `Unknown driver type: ${driverRecord.type}`,
        responseTime: Date.now() - startTime,
      });
    }

    // Build config from DB record
    const parsedConfig = JSON.parse(driverRecord.config || '{}');
    const storageConfig: StorageDriverConfig = {
      id: driverRecord.id,
      name: driverRecord.name,
      type: driverRecord.type as StorageDriverConfig['type'],
      config: parsedConfig,
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

    const driver = factory.create(storageConfig);

    try {
      const result = await driver.healthCheck();
      const responseTime = Date.now() - startTime;

      // Determine new auth status based on health check result
      let newAuthStatus = driverRecord.authStatus;
      if (result.healthy) {
        newAuthStatus = 'authorized';
      } else if (
        result.message?.includes('expired') ||
        result.message?.includes('过期')
      ) {
        newAuthStatus = 'expired';
      } else if (
        result.message?.includes('authorize') ||
        result.message?.includes('login') ||
        result.message?.includes('登录') ||
        result.message?.includes('授权')
      ) {
        newAuthStatus = 'pending';
      } else {
        newAuthStatus = 'error';
      }

      // Update authStatus in DB if changed
      if (newAuthStatus !== driverRecord.authStatus) {
        await db.storageDriver.update({
          where: { id },
          data: {
            authStatus: newAuthStatus,
            status: result.healthy ? 'active' : 'error',
            lastSyncAt: result.healthy ? new Date() : undefined,
          },
        });
        invalidateDriver(id);
      }

      return NextResponse.json({
        healthy: result.healthy,
        message: result.message,
        responseTime,
        authStatus: newAuthStatus,
        driverStatus: result.healthy ? 'active' : 'error',
      });
    } catch (healthError) {
      const responseTime = Date.now() - startTime;

      // Health check threw an error
      await db.storageDriver.update({
        where: { id },
        data: {
          authStatus: 'error',
          status: 'error',
        },
      });
      invalidateDriver(id);

      return NextResponse.json({
        healthy: false,
        message: healthError instanceof Error ? healthError.message : 'Health check failed',
        responseTime,
        authStatus: 'error',
        driverStatus: 'error',
      });
    }
  } catch (error) {
    console.error('Error running health check:', error);
    return NextResponse.json({ error: 'Failed to run health check' }, { status: 500 });
  }
}
