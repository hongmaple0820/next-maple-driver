import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { existsSync } from 'fs';

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

    const { name, type, basePath, priority, isDefault, config } = await request.json();

    if (!name || !type) {
      return NextResponse.json(
        { error: 'Name and type are required' },
        { status: 400 }
      );
    }

    // For now only local type is supported
    if (type !== 'local') {
      return NextResponse.json(
        { error: 'Only local storage type is currently supported' },
        { status: 400 }
      );
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await db.storageDriver.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const driver = await db.storageDriver.create({
      data: {
        name,
        type,
        basePath: basePath || '',
        priority: priority || 0,
        isDefault: isDefault || false,
        config: config ? JSON.stringify(config) : '{}',
        status: 'active',
      },
    });

    return NextResponse.json({
      id: driver.id,
      name: driver.name,
      type: driver.type,
      status: driver.status,
      priority: driver.priority,
      isDefault: driver.isDefault,
      basePath: driver.basePath,
      config: driver.config,
      createdAt: driver.createdAt.toISOString(),
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating driver:', error);
    return NextResponse.json({ error: 'Failed to create driver' }, { status: 500 });
  }
}
