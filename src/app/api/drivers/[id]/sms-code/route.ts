import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/drivers/[id]/sms-code - Previously used for SMS verification code.
 *
 * NOTE: This endpoint is no longer supported for Quark driver.
 * Quark does not have a public login API. Please use:
 * - Cookie-based authentication (provide cookies via /api/drivers/[id]/authorize)
 * - QR code scanning (via /api/drivers/[id]/qr-login)
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  return NextResponse.json(
    {
      error: '夸克网盘不支持短信验证码登录。请使用以下方式之一：\n1. 通过 Cookie 登录（在 /api/drivers/[id]/authorize 中提供 cookies）\n2. 通过二维码扫描登录（/api/drivers/[id]/qr-login）',
      supportedMethods: ['cookies', 'qrcode'],
      cookiesEndpoint: `/api/drivers/${id}/authorize`,
      qrcodeEndpoint: `/api/drivers/${id}/qr-login`,
    },
    { status: 400 }
  );
}
