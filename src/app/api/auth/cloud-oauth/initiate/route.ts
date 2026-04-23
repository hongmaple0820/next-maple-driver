import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getDriverFactory, isOAuthDriver } from '@/lib/storage-drivers/manager';
import { CloudDriverBase } from '@/lib/storage-drivers/cloud-driver-base';
import { randomUUID } from 'crypto';

/**
 * OAuth Initiation Route
 * Generates the OAuth authorization URL for a given cloud driver provider.
 * The user is redirected to this URL to grant access.
 * 
 * POST /api/auth/cloud-oauth/initiate
 * Body: { driverId: string }
 * Response: { authorizationUrl: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { driverId } = await request.json();

    if (!driverId) {
      return NextResponse.json(
        { error: 'Driver ID is required' },
        { status: 400 }
      );
    }

    // Find the driver config in the database
    const driverConfig = await db.storageDriver.findUnique({
      where: { id: driverId },
    });

    if (!driverConfig) {
      return NextResponse.json(
        { error: 'Driver configuration not found' },
        { status: 404 }
      );
    }

    // Validate this is an OAuth driver type
    if (!isOAuthDriver(driverConfig.type)) {
      return NextResponse.json(
        { error: `Driver type "${driverConfig.type}" does not support OAuth` },
        { status: 400 }
      );
    }

    // Get the driver factory and create a driver instance
    const factory = getDriverFactory(driverConfig.type);
    if (!factory) {
      return NextResponse.json(
        { error: `Unknown driver type: ${driverConfig.type}` },
        { status: 400 }
      );
    }

    // Parse the stored config
    const parsedConfig = JSON.parse(driverConfig.config || '{}');

    // Build the redirect URI for our callback endpoint
    const callbackUrl = new URL('/api/auth/cloud-oauth/callback', request.url).toString();

    // Override the redirect URI in config if not already set
    if (!parsedConfig.redirectUri) {
      parsedConfig.redirectUri = callbackUrl;
    }

    // Create a StorageDriverConfig from the DB record
    const storageConfig = {
      id: driverConfig.id,
      name: driverConfig.name,
      type: driverConfig.type as "baidu" | "aliyun" | "onedrive" | "google",
      config: parsedConfig,
      isDefault: driverConfig.isDefault,
      isEnabled: driverConfig.status === 'active',
      createdAt: driverConfig.createdAt,
      updatedAt: driverConfig.updatedAt,
      authType: 'oauth' as const,
      authStatus: (driverConfig as Record<string, unknown>).authStatus as "pending" | "authorized" | "expired" | "error" | undefined,
      accessToken: (driverConfig as Record<string, unknown>).accessToken as string | undefined,
      refreshToken: (driverConfig as Record<string, unknown>).refreshToken as string | undefined,
      tokenExpiresAt: (driverConfig as Record<string, unknown>).tokenExpiresAt as Date | undefined,
    };

    // Create driver instance
    const driver = factory.create(storageConfig);

    if (!(driver instanceof CloudDriverBase)) {
      return NextResponse.json(
        { error: 'Driver does not support OAuth flow' },
        { status: 400 }
      );
    }

    // Generate state parameter (driverId + random nonce for CSRF protection)
    const nonce = randomUUID();
    const state = `${driverId}:${nonce}`;

    // Update driver status to indicate OAuth is in progress
    await db.storageDriver.update({
      where: { id: driverId },
      data: {
        authType: 'oauth',
        authStatus: 'pending',
      },
    });

    // Generate the authorization URL
    const authorizationUrl = driver.getAuthorizationUrl(state);

    return NextResponse.json({
      authorizationUrl,
      state,
      provider: driverConfig.type,
    });
  } catch (error) {
    console.error('OAuth initiation error:', error);
    return NextResponse.json(
      { error: 'Failed to initiate OAuth flow' },
      { status: 500 }
    );
  }
}
