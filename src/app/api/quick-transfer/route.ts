import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, unauthorizedResponse } from '@/lib/auth-helpers';

// Generate a random 6-character alphanumeric code (uppercase + digits)
function generateTransferCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // exclude confusing chars I,O,0,1
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// POST /api/quick-transfer - Create a quick transfer session (generates 6-char code)
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return unauthorizedResponse();
    }
    const userId = (user as Record<string, unknown>).id as string;

    const body = await request.json().catch(() => ({}));
    const folderId = body.folderId || null; // null = root
    const folderName = body.folderName || '/';

    // Deactivate any existing active sessions for this user
    await db.quickTransferSession.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });

    // Generate a unique code
    let code = generateTransferCode();
    let attempts = 0;
    while (attempts < 10) {
      const existing = await db.quickTransferSession.findUnique({ where: { code } });
      if (!existing) break;
      code = generateTransferCode();
      attempts++;
    }

    // Session expires in 30 minutes
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    const session = await db.quickTransferSession.create({
      data: {
        code,
        userId,
        folderId,
        folderName,
        isActive: true,
        expiresAt,
      },
    });

    return NextResponse.json({
      id: session.id,
      code: session.code,
      folderId: session.folderId,
      folderName: session.folderName,
      isActive: session.isActive,
      expiresAt: session.expiresAt.toISOString(),
      createdAt: session.createdAt.toISOString(),
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating quick transfer session:', error);
    return NextResponse.json(
      { error: 'Failed to create transfer session' },
      { status: 500 }
    );
  }
}

// GET /api/quick-transfer - List active quick transfer sessions for current user
export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return unauthorizedResponse();
    }
    const userId = (user as Record<string, unknown>).id as string;

    // Clean up expired sessions
    await db.quickTransferSession.updateMany({
      where: { userId, expiresAt: { lt: new Date() }, isActive: true },
      data: { isActive: false },
    });

    const sessions = await db.quickTransferSession.findMany({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(
      sessions.map((s) => ({
        id: s.id,
        code: s.code,
        folderId: s.folderId,
        folderName: s.folderName,
        isActive: s.isActive,
        expiresAt: s.expiresAt.toISOString(),
        createdAt: s.createdAt.toISOString(),
      }))
    );
  } catch (error) {
    console.error('Error listing quick transfer sessions:', error);
    return NextResponse.json(
      { error: 'Failed to list sessions' },
      { status: 500 }
    );
  }
}
