import { NextRequest, NextResponse } from 'next/server';
import { getQrLoginSession, updateQrLoginSession } from '@/lib/qr-login-sessions';
import { getAuthUser } from '@/lib/auth-helpers';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.NEXTAUTH_SECRET || "clouddrive-dev-secret-key-2024";

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

    const userId = (user as Record<string, unknown>).id as string;
    const userEmail = (user as Record<string, unknown>).email as string;
    const userName = (user as Record<string, unknown>).name as string;
    const userRole = (user as Record<string, unknown>).role as string;

    // Generate a JWT token that can be used for the __qr_token__ credentials login
    const token = jwt.sign(
      { id: userId, email: userEmail, name: userName, role: userRole },
      JWT_SECRET,
      { expiresIn: '5m' }
    );

    // Confirm the login and store the token
    updateQrLoginSession(sessionId, {
      status: "confirmed",
      userId,
      userEmail,
      userName,
      userRole,
      token,
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
