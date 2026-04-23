import { NextRequest, NextResponse } from 'next/server';
import { getQrLoginSession, updateQrLoginSession } from '@/lib/qr-login-sessions';
import { getAuthUser } from '@/lib/auth-helpers';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { sessionId } = await params;
    const session = getQrLoginSession(sessionId);

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found or expired' },
        { status: 404 }
      );
    }

    if (session.status === "expired") {
      return NextResponse.json(
        { error: 'Session expired' },
        { status: 410 }
      );
    }

    // Confirm the login
    const updatedSession = updateQrLoginSession(sessionId, {
      status: "confirmed",
      userId: (user as Record<string, unknown>).id as string,
      userEmail: (user as Record<string, unknown>).email as string,
      userName: (user as Record<string, unknown>).name as string,
      userRole: (user as Record<string, unknown>).role as string,
    });

    return NextResponse.json({
      success: true,
      message: 'Login authorized',
    });
  } catch (error) {
    console.error('Error confirming QR login:', error);
    return NextResponse.json(
      { error: 'Failed to confirm login' },
      { status: 500 }
    );
  }
}
