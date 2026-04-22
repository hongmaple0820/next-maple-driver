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

// PUT /api/admin/drivers/[id] - Update driver
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdmin();
    if (!session) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, status, priority, isDefault, basePath, config } = body;

    const existing = await db.storageDriver.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await db.storageDriver.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (status !== undefined) updateData.status = status;
    if (priority !== undefined) updateData.priority = priority;
    if (isDefault !== undefined) updateData.isDefault = isDefault;
    if (basePath !== undefined) updateData.basePath = basePath;
    if (config !== undefined) updateData.config = JSON.stringify(config);

    const driver = await db.storageDriver.update({
      where: { id },
      data: updateData,
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
      updatedAt: driver.updatedAt.toISOString(),
      healthy: driver.type === 'local' ? existsSync(driver.basePath || './storage') : false,
    });
  } catch (error) {
    console.error('Error updating driver:', error);
    return NextResponse.json({ error: 'Failed to update driver' }, { status: 500 });
  }
}

// DELETE /api/admin/drivers/[id] - Delete driver
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdmin();
    if (!session) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting driver:', error);
    return NextResponse.json({ error: 'Failed to delete driver' }, { status: 500 });
  }
}
