import { NextRequest, NextResponse } from 'next/server';
import { createId } from '@paralleldrive/cuid2';
import { createSession } from '@/lib/qr-sessions';

// POST /api/transfer/qr-session - Create a temporary QR session for mobile upload
export async function POST(request: NextRequest) {
  try {
    // Try to get auth user, but allow anonymous
    let userId: string | null = null;
    try {
      const { getAuthUser } = await import('@/lib/auth-helpers');
      const user = await getAuthUser();
      if (user) {
        userId = (user as Record<string, unknown>).id as string;
      }
    } catch {
      // Anonymous is ok
    }

    const sessionId = createId();
    const session = createSession(sessionId, userId);

    // Build the URL that mobile devices will visit
    const origin = request.nextUrl.origin;
    const qrData = `${origin}/transfer-upload?session=${sessionId}`;

    return NextResponse.json({
      sessionId,
      expiresAt: session.expiresAt,
      qrData,
    });
  } catch (error) {
    console.error('Error creating QR session:', error);
    return NextResponse.json(
      { error: 'Failed to create QR session' },
      { status: 500 }
    );
  }
}
