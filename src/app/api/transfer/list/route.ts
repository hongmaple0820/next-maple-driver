import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, unauthorizedResponse } from '@/lib/auth-helpers';

// GET /api/transfer/list - List user's transfer files (requires auth)
export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return unauthorizedResponse();
    }
    const userId = (user as Record<string, unknown>).id as string;

    const transfers = await db.transferFile.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(
      transfers.map((t) => ({
        id: t.id,
        token: t.token,
        fileName: t.fileName,
        fileSize: t.fileSize,
        mimeType: t.mimeType,
        hasPassword: !!t.password,
        expiresAt: t.expiresAt?.toISOString() || null,
        downloadCount: t.downloadCount,
        maxDownloads: t.maxDownloads,
        createdAt: t.createdAt.toISOString(),
        shareUrl: `/transfer/${t.token}`,
        isExpired: t.expiresAt ? t.expiresAt < new Date() : false,
      }))
    );
  } catch (error) {
    console.error('Error listing transfer files:', error);
    return NextResponse.json(
      { error: 'Failed to list transfers' },
      { status: 500 }
    );
  }
}
