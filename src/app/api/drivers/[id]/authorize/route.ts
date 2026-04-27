import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  getDriverFactory,
  isOAuthDriver,
  isPasswordDriver,
  invalidateDriver,
} from '@/lib/storage-drivers/manager';
import { CloudDriverBase } from '@/lib/storage-drivers/cloud-driver-base';
import { CookieAuthDriver } from '@/lib/storage-drivers/cloud-driver-base';
import { invalidateMountCache } from '@/lib/vfs';
import type { StorageDriverConfig } from '@/lib/storage-drivers/types';
import { randomUUID } from 'crypto';

/**
 * Build a StorageDriverConfig from a DB record for creating driver instances.
 */
function buildStorageConfig(driverRecord: Record<string, unknown>): StorageDriverConfig {
  const parsedConfig = JSON.parse((driverRecord.config as string) || '{}');
  return {
    id: driverRecord.id as string,
    name: driverRecord.name as string,
    type: driverRecord.type as StorageDriverConfig['type'],
    config: parsedConfig,
    isDefault: driverRecord.isDefault as boolean,
    isEnabled: driverRecord.isEnabled as boolean,
    createdAt: driverRecord.createdAt as Date,
    updatedAt: driverRecord.updatedAt as Date,
    authType: driverRecord.authType as StorageDriverConfig['authType'],
    authStatus: driverRecord.authStatus as StorageDriverConfig['authStatus'],
    accessToken: (driverRecord.accessToken as string) || undefined,
    refreshToken: (driverRecord.refreshToken as string) || undefined,
    tokenExpiresAt: (driverRecord.tokenExpiresAt as Date) || undefined,
  };
}

/**
 * POST /api/drivers/[id]/authorize - Initiate authorization for a driver
 *
 * For OAuth drivers (baidu, aliyun, onedrive, google):
 *   Generates authorization URL, saves state, returns the URL for frontend redirect.
 *
 * For non-OAuth drivers (quark, 115):
 *   Accepts credentials (phone+password/SMS, or account+password),
 *   performs login, saves cookies/tokens.
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

    const driverRecord = await db.storageDriver.findUnique({ where: { id } });
    if (!driverRecord) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
    }

    // --- OAuth Drivers ---
    if (isOAuthDriver(driverRecord.type)) {
      return await handleOAuthAuthorize(driverRecord, request);
    }

    // --- Password/Cookie-based Drivers ---
    if (isPasswordDriver(driverRecord.type)) {
      return await handleCredentialLogin(driverRecord, body);
    }

    return NextResponse.json(
      { error: `Authorization not supported for driver type: ${driverRecord.type}` },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error authorizing driver:', error);
    return NextResponse.json(
      {
        error: 'Failed to authorize driver',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * Handle OAuth authorization for OAuth-type drivers.
 * Generates the authorization URL and returns it to the frontend.
 */
async function handleOAuthAuthorize(
  driverRecord: Record<string, unknown>,
  request: NextRequest
) {
  const factory = getDriverFactory(driverRecord.type as string);
  if (!factory) {
    return NextResponse.json(
      { error: `Unknown driver type: ${driverRecord.type}` },
      { status: 400 }
    );
  }

  const parsedConfig = JSON.parse((driverRecord.config as string) || '{}');

  // Build the callback URL for our OAuth callback endpoint
  const callbackUrl = new URL('/api/auth/cloud-oauth/callback', request.url).toString();

  // Override the redirect URI in config if not already set
  if (!parsedConfig.redirectUri) {
    parsedConfig.redirectUri = callbackUrl;
  }

  const storageConfig: StorageDriverConfig = {
    id: driverRecord.id as string,
    name: driverRecord.name as string,
    type: driverRecord.type as StorageDriverConfig['type'],
    config: parsedConfig,
    isDefault: driverRecord.isDefault as boolean,
    isEnabled: driverRecord.isEnabled as boolean,
    createdAt: driverRecord.createdAt as Date,
    updatedAt: driverRecord.updatedAt as Date,
    authType: 'oauth',
    authStatus: driverRecord.authStatus as StorageDriverConfig['authStatus'],
    accessToken: (driverRecord.accessToken as string) || undefined,
    refreshToken: (driverRecord.refreshToken as string) || undefined,
    tokenExpiresAt: (driverRecord.tokenExpiresAt as Date) || undefined,
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
  const state = `${driverRecord.id}:${nonce}`;

  // Update driver status to indicate OAuth is in progress
  await db.storageDriver.update({
    where: { id: driverRecord.id as string },
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
    provider: driverRecord.type,
    authType: 'oauth',
  });
}

/**
 * Handle credential-based login for password/SMS drivers (quark, 115).
 * Accepts credentials, performs login, saves cookies/tokens.
 */
async function handleCredentialLogin(
  driverRecord: Record<string, unknown>,
  body: Record<string, unknown>
) {
  const driverType = driverRecord.type as string;
  const driverId = driverRecord.id as string;
  const factory = getDriverFactory(driverType);
  if (!factory) {
    return NextResponse.json(
      { error: `Unknown driver type: ${driverType}` },
      { status: 400 }
    );
  }

  // Merge provided credentials into existing config
  const existingConfig = JSON.parse((driverRecord.config as string) || '{}');
  const updatedConfig = { ...existingConfig };

  // --- Quark Driver ---
  if (driverType === 'quark') {
    const { phone, password, smsCode } = body;
    if (!phone) {
      return NextResponse.json(
        { error: 'Phone number is required for Quark login' },
        { status: 400 }
      );
    }
    updatedConfig.phone = phone as string;
    if (password) updatedConfig.password = password as string;
    if (smsCode) updatedConfig.smsCode = smsCode as string;

    if (!updatedConfig.password && !updatedConfig.smsCode) {
      return NextResponse.json(
        { error: 'Either password or SMS code is required for Quark login' },
        { status: 400 }
      );
    }
  }
  // --- 115 Driver ---
  else if (driverType === '115') {
    const { username, password } = body;
    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required for 115 login' },
        { status: 400 }
      );
    }
    updatedConfig.username = username as string;
    updatedConfig.password = password as string;
  }

  // Update the driver config in DB with the new credentials
  await db.storageDriver.update({
    where: { id: driverId },
    data: {
      config: JSON.stringify(updatedConfig),
      authStatus: 'pending',
    },
  });

  // Create a driver instance and attempt login
  const storageConfig: StorageDriverConfig = {
    id: driverId,
    name: driverRecord.name as string,
    type: driverType as StorageDriverConfig['type'],
    config: updatedConfig,
    isDefault: driverRecord.isDefault as boolean,
    isEnabled: driverRecord.isEnabled as boolean,
    createdAt: driverRecord.createdAt as Date,
    updatedAt: driverRecord.updatedAt as Date,
  };

  const driver = factory.create(storageConfig);

  if (!(driver instanceof CookieAuthDriver)) {
    return NextResponse.json(
      { error: 'Driver does not support credential login' },
      { status: 400 }
    );
  }

  try {
    // Perform login to get cookies
    const cookies = await driver.login();

    // Save cookies to config and update auth status
    const configWithCookies = { ...updatedConfig, cookies };

    await db.storageDriver.update({
      where: { id: driverId },
      data: {
        config: JSON.stringify(configWithCookies),
        authType: driverType === 'quark' && updatedConfig.smsCode ? 'sms' : 'password',
        authStatus: 'authorized',
        lastSyncAt: new Date(),
      },
    });

    // Invalidate cached driver instance
    invalidateDriver(driverId);
    invalidateMountCache();

    return NextResponse.json({
      success: true,
      authType: driverType === 'quark' && updatedConfig.smsCode ? 'sms' : 'password',
      authStatus: 'authorized',
      message: `${driverType === 'quark' ? '夸克网盘' : '115网盘'}登录成功`,
    });
  } catch (loginError) {
    // Login failed - update auth status to error
    await db.storageDriver.update({
      where: { id: driverId },
      data: { authStatus: 'error' },
    });

    invalidateDriver(driverId);

    return NextResponse.json(
      {
        error: 'Login failed',
        details: loginError instanceof Error ? loginError.message : String(loginError),
      },
      { status: 401 }
    );
  }
}

/**
 * DELETE /api/drivers/[id]/authorize - De-authorize a driver
 * Clears tokens, sets authStatus to "pending"
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

    const driverRecord = await db.storageDriver.findUnique({ where: { id } });
    if (!driverRecord) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
    }

    // Clear tokens and cookies from config
    const existingConfig = JSON.parse(driverRecord.config || '{}');
    const cleanedConfig = { ...existingConfig };
    delete cleanedConfig.cookies;
    delete cleanedConfig.accessToken;
    delete cleanedConfig.refreshToken;
    delete cleanedConfig.smsCode;
    // Keep phone/username/password so user can re-auth without re-entering

    await db.storageDriver.update({
      where: { id },
      data: {
        config: JSON.stringify(cleanedConfig),
        authStatus: 'pending',
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null,
        lastSyncAt: null,
      },
    });

    // Invalidate cached driver instance and VFS
    invalidateDriver(id);
    invalidateMountCache();

    return NextResponse.json({
      success: true,
      message: 'Driver de-authorized successfully',
    });
  } catch (error) {
    console.error('Error de-authorizing driver:', error);
    return NextResponse.json({ error: 'Failed to de-authorize driver' }, { status: 500 });
  }
}
