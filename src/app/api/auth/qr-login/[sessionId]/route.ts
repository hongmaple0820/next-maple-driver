import { NextRequest, NextResponse } from 'next/server';
import { getQrLoginSession } from '@/lib/qr-login-sessions';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const session = getQrLoginSession(sessionId);

    if (!session) {
      return NextResponse.json(
        { status: "expired" },
        { status: 200 }
      );
    }

    return NextResponse.json({
      status: session.status,
      token: session.status === "confirmed" ? session.token : null,
      user: session.status === "confirmed" ? {
        id: session.userId,
        email: session.userEmail,
        name: session.userName,
        role: session.userRole,
      } : null,
    });
  } catch (error) {
    console.error('Error polling QR login session:', error);
    return NextResponse.json(
      { error: 'Failed to poll QR login session' },
      { status: 500 }
    );
  }
}
