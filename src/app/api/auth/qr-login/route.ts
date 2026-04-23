import { NextRequest, NextResponse } from 'next/server';
import { createQrLoginSession } from '@/lib/qr-login-sessions';

export async function POST(request: NextRequest) {
  try {
    const session = createQrLoginSession(5 * 60 * 1000); // 5 minutes TTL
    const origin = request.headers.get('host') || 'localhost:3000';
    const protocol = request.headers.get('x-forwarded-proto') || 'http';
    const qrData = `${protocol}://${origin}/qr-auth?session=${session.sessionId}`;

    return NextResponse.json({
      sessionId: session.sessionId,
      qrData,
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    console.error('Error creating QR login session:', error);
    return NextResponse.json(
      { error: 'Failed to create QR login session' },
      { status: 500 }
    );
  }
}
