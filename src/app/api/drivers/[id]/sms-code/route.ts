import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDriverFactory } from '@/lib/storage-drivers/manager';
import { QuarkDriver } from '@/lib/storage-drivers/quark-driver';
import type { StorageDriverConfig } from '@/lib/storage-drivers/types';

/**
 * POST /api/drivers/[id]/sms-code - Request SMS verification code for Quark driver
 * Accepts phone number, calls the Quark driver's requestSmsCode method.
 */
export async function POST(
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
    const { phone } = body;

    // Find the driver in the database
    const driverRecord = await db.storageDriver.findUnique({ where: { id } });
    if (!driverRecord) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
    }

    // Only Quark driver supports SMS code
    if (driverRecord.type !== 'quark') {
      return NextResponse.json(
        { error: `SMS code request not supported for driver type: ${driverRecord.type}` },
        { status: 400 }
      );
    }

    // Get the factory and create a driver instance
    const factory = await getDriverFactory('quark');
    if (!factory) {
      return NextResponse.json(
        { error: 'Quark driver factory not found' },
        { status: 500 }
      );
    }

    // Parse the stored config and update with provided phone
    const parsedConfig = JSON.parse(driverRecord.config || '{}');
    if (phone) {
      parsedConfig.phone = phone;
    }

    const storageConfig: StorageDriverConfig = {
      id: driverRecord.id,
      name: driverRecord.name,
      type: 'quark',
      config: parsedConfig,
      isDefault: driverRecord.isDefault,
      isEnabled: driverRecord.isEnabled,
      createdAt: driverRecord.createdAt,
      updatedAt: driverRecord.updatedAt,
    };

    // Create driver instance
    const driver = factory.create(storageConfig);

    if (!(driver instanceof QuarkDriver)) {
      return NextResponse.json(
        { error: 'Failed to create Quark driver instance' },
        { status: 500 }
      );
    }

    // Request SMS code using the Quark driver method
    const result = await driver.requestSmsCode(phone);

    if (result.success) {
      // Update the phone number in config if provided
      if (phone) {
        await db.storageDriver.update({
          where: { id },
          data: {
            config: JSON.stringify(parsedConfig),
          },
        });
      }

      return NextResponse.json({
        success: true,
        message: result.message,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.message,
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error requesting SMS code:', error);
    return NextResponse.json(
      { error: 'Failed to request SMS code' },
      { status: 500 }
    );
  }
}
