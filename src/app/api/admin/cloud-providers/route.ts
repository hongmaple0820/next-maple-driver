import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * Cloud provider types that support OAuth
 */
const OAUTH_PROVIDER_TYPES = ['baidu', 'aliyun', 'onedrive', 'google'] as const;

/**
 * Cloud provider types that use cookie/QR login (non-OAuth)
 */
const COOKIE_PROVIDER_TYPES = ['115', 'quark'] as const;

/**
 * Provider display info
 */
const PROVIDER_INFO: Record<string, {
  label: string;
  description: string;
  authType: 'oauth' | 'cookie';
  oauthFields: string[];
}> = {
  baidu: {
    label: '百度网盘',
    description: '通过百度开放平台 OAuth 2.0 授权',
    authType: 'oauth',
    oauthFields: ['clientId', 'clientSecret', 'redirectUri'],
  },
  aliyun: {
    label: '阿里云盘',
    description: '通过阿里云盘开放平台 OAuth 2.0 授权',
    authType: 'oauth',
    oauthFields: ['clientId', 'clientSecret', 'redirectUri'],
  },
  onedrive: {
    label: 'OneDrive',
    description: '通过 Microsoft Azure AD OAuth 2.0 授权',
    authType: 'oauth',
    oauthFields: ['clientId', 'clientSecret', 'tenantId', 'redirectUri'],
  },
  google: {
    label: 'Google Drive',
    description: '通过 Google Cloud Console OAuth 2.0 授权',
    authType: 'oauth',
    oauthFields: ['clientId', 'clientSecret', 'redirectUri'],
  },
  '115': {
    label: '115网盘',
    description: '通过 Cookie 或二维码扫描登录',
    authType: 'cookie',
    oauthFields: [],
  },
  quark: {
    label: '夸克网盘',
    description: '通过 Cookie 或二维码扫描登录',
    authType: 'cookie',
    oauthFields: [],
  },
};

/**
 * GET /api/admin/cloud-providers - Returns the current OAuth config for each provider
 * Only returns clientId (never expose secrets)
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Check admin role
    const user = await db.user.findUnique({ where: { email: session.user.email! } });
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Find all provider config records (those with IDs starting with "provider-")
    const providerRecords = await db.storageDriver.findMany({
      where: {
        id: { startsWith: 'provider-' },
      },
    });

    const providers: Record<string, {
      label: string;
      description: string;
      authType: string;
      configured: boolean;
      clientId?: string;
      redirectUri?: string;
      tenantId?: string;
      oauthFields: string[];
    }> = {};

    // Build response for all known providers
    for (const [type, info] of Object.entries(PROVIDER_INFO)) {
      const record = providerRecords.find((r) => r.type === type);
      let parsedConfig: Record<string, string> = {};
      if (record) {
        try {
          parsedConfig = JSON.parse(record.config || '{}');
        } catch { /* ignore */ }
      }

      providers[type] = {
        label: info.label,
        description: info.description,
        authType: info.authType,
        configured: !!(parsedConfig.clientId || parsedConfig.cookies),
        clientId: parsedConfig.clientId || undefined,
        redirectUri: parsedConfig.redirectUri || undefined,
        tenantId: parsedConfig.tenantId || undefined,
        oauthFields: info.oauthFields,
      };
    }

    return NextResponse.json({ providers });
  } catch (error) {
    console.error('Error getting cloud providers:', error);
    return NextResponse.json({ error: 'Failed to get cloud providers' }, { status: 500 });
  }
}

/**
 * PUT /api/admin/cloud-providers - Updates the OAuth config for providers
 * Body: { providers: { [type]: { clientId, clientSecret, redirectUri, tenantId } } }
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Check admin role
    const user = await db.user.findUnique({ where: { email: session.user.email! } });
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { providers: providersInput } = body as {
      providers: Record<string, Record<string, string>>;
    };

    if (!providersInput || typeof providersInput !== 'object') {
      return NextResponse.json({ error: 'providers object is required' }, { status: 400 });
    }

    const results: Record<string, { success: boolean; error?: string }> = {};

    for (const [type, credentials] of Object.entries(providersInput)) {
      const info = PROVIDER_INFO[type];
      if (!info) {
        results[type] = { success: false, error: `Unknown provider type: ${type}` };
        continue;
      }

      // Only OAuth providers can be configured here
      if (info.authType !== 'oauth') {
        results[type] = { success: false, error: '非 OAuth 提供商，无需配置 OAuth 凭据' };
        continue;
      }

      const providerId = `provider-${type}`;

      try {
        // Find existing record
        const existing = await db.storageDriver.findUnique({ where: { id: providerId } });

        // Build config - merge with existing if present
        let existingConfig: Record<string, string> = {};
        if (existing) {
          try {
            existingConfig = JSON.parse(existing.config || '{}');
          } catch { /* ignore */ }
        }

        // Update with new credentials, keeping existing clientSecret if not provided
        const newConfig: Record<string, string> = {
          ...existingConfig,
        };

        if (credentials.clientId !== undefined) {
          newConfig.clientId = credentials.clientId;
        }
        if (credentials.clientSecret !== undefined && credentials.clientSecret !== '') {
          newConfig.clientSecret = credentials.clientSecret;
        }
        if (credentials.redirectUri !== undefined) {
          newConfig.redirectUri = credentials.redirectUri;
        }
        if (credentials.tenantId !== undefined) {
          newConfig.tenantId = credentials.tenantId;
        }

        if (existing) {
          await db.storageDriver.update({
            where: { id: providerId },
            data: { config: JSON.stringify(newConfig) },
          });
        } else {
          await db.storageDriver.create({
            data: {
              id: providerId,
              name: `${info.label} 全局配置`,
              type,
              config: JSON.stringify(newConfig),
              status: 'active',
              isDefault: false,
              isEnabled: true,
              authType: 'oauth',
              authStatus: 'none',
            },
          });
        }

        results[type] = { success: true };
      } catch (err) {
        results[type] = {
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Error updating cloud providers:', error);
    return NextResponse.json({ error: 'Failed to update cloud providers' }, { status: 500 });
  }
}
