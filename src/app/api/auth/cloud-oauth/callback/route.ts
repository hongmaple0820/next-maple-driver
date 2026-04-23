import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getDriverFactory, isOAuthDriver } from '@/lib/storage-drivers/manager';
import { CloudDriverBase } from '@/lib/storage-drivers/cloud-driver-base';

/**
 * OAuth Callback Route
 * Handles OAuth2 callbacks from all cloud providers.
 * Exchanges the authorization code for tokens and stores them.
 * 
 * URL: /api/auth/cloud-oauth/callback?code=xxx&state=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Handle OAuth error from provider
    if (error) {
      const errorDescription = searchParams.get('error_description') || error;
      console.error('OAuth error:', error, errorDescription);
      return NextResponse.redirect(
        new URL(`/?oauth_error=${encodeURIComponent(errorDescription)}`, request.url)
      );
    }

    if (!code || !state) {
      return NextResponse.json(
        { error: 'Missing authorization code or state parameter' },
        { status: 400 }
      );
    }

    // Decode state to get driver config ID
    // State format: "{driverId}:{randomNonce}"
    const [driverId] = state.split(':');
    if (!driverId) {
      return NextResponse.json(
        { error: 'Invalid state parameter' },
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
      authType: (driverConfig as Record<string, unknown>).authType as "oauth" | undefined,
      authStatus: (driverConfig as Record<string, unknown>).authStatus as "pending" | "authorized" | "expired" | "error" | undefined,
      accessToken: (driverConfig as Record<string, unknown>).accessToken as string | undefined,
      refreshToken: (driverConfig as Record<string, unknown>).refreshToken as string | undefined,
      tokenExpiresAt: (driverConfig as Record<string, unknown>).tokenExpiresAt as Date | undefined,
    };

    // Create driver instance and exchange code for token
    const driver = factory.create(storageConfig);

    if (!(driver instanceof CloudDriverBase)) {
      return NextResponse.json(
        { error: 'Driver does not support OAuth flow' },
        { status: 400 }
      );
    }

    // Exchange authorization code for tokens
    const tokenResponse = await driver.exchangeCodeForToken(code);

    // Calculate token expiration
    const tokenExpiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000);

    // Update the driver config in the database with the new tokens
    await db.storageDriver.update({
      where: { id: driverId },
      data: {
        // Store tokens in the new auth fields
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        tokenExpiresAt,
        authType: 'oauth',
        authStatus: 'authorized',
        // Also update the config JSON with refresh token for backward compatibility
        config: JSON.stringify({
          ...parsedConfig,
          refreshToken: tokenResponse.refresh_token,
          accessToken: tokenResponse.access_token,
        }),
        status: 'active',
      },
    });

    // Redirect back to admin panel with success
    return NextResponse.redirect(
      new URL('/?oauth_success=true', request.url)
    );
  } catch (error) {
    console.error('OAuth callback error:', error);
    return NextResponse.redirect(
      new URL(`/?oauth_error=${encodeURIComponent('OAuth authentication failed')}`, request.url)
    );
  }
}
