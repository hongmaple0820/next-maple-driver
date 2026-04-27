import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as Record<string, unknown>).role !== 'admin') {
    return null;
  }
  return session;
}

// GET /api/admin/stats - System statistics
export async function GET() {
  try {
    const session = await requireAdmin();
    if (!session) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const [
      totalUsers,
      totalFiles,
      totalFolders,
      totalShares,
      activeShares,
      allFiles,
      users,
      recentFiles,
    ] = await Promise.all([
      db.user.count(),
      db.fileItem.count({ where: { type: 'file', isTrashed: false } }),
      db.fileItem.count({ where: { type: 'folder', isTrashed: false } }),
      db.shareLink.count(),
      db.shareLink.count({
        where: {
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
      }),
      db.fileItem.findMany({
        where: { type: 'file', isTrashed: false },
        select: { size: true, mimeType: true, userId: true },
      }),
      db.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          storageLimit: true,
          files: {
            where: { type: 'file', isTrashed: false },
            select: { size: true },
          },
        },
      }),
      db.fileItem.findMany({
        where: { isTrashed: false },
        select: { id: true, name: true, type: true, updatedAt: true, userId: true },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      }),
    ]);

    const totalStorageUsed = allFiles.reduce((sum, f) => sum + f.size, 0);

    // Storage by type
    const byType: Record<string, number> = {};
    for (const file of allFiles) {
      const type = getTypeCategory(file.mimeType);
      byType[type] = (byType[type] || 0) + file.size;
    }

    // Storage by user
    const storageByUser = users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      usedBytes: user.files.reduce((sum, f) => sum + f.size, 0),
      storageLimit: Number(user.storageLimit),
    }));

    // Recent activity
    const recentActivity = recentFiles.map((f) => ({
      id: f.id,
      name: f.name,
      type: f.type,
      action: f.type === 'folder' ? 'create' : 'upload',
      updatedAt: f.updatedAt.toISOString(),
      userId: f.userId,
    }));

    return NextResponse.json({
      totalUsers,
      totalFiles,
      totalFolders,
      totalShares,
      activeShares,
      totalStorageUsed,
      byType,
      storageByUser,
      recentActivity,
    });
  } catch (error) {
    console.error('Error getting admin stats:', error);
    return NextResponse.json({ error: 'Failed to get system statistics' }, { status: 500 });
  }
}

function getTypeCategory(mimeType: string): string {
  if (!mimeType) return 'other';
  const mime = mimeType.toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'document';
  if (mime.includes('json') || mime.includes('javascript') || mime.includes('typescript') || mime.includes('xml') || mime.includes('html') || mime.includes('css')) return 'code';
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('tar') || mime.includes('gzip') || mime.includes('7z')) return 'archive';
  if (mime.includes('document') || mime.includes('word') || mime.includes('text/plain') || mime.includes('spreadsheet') || mime.includes('excel')) return 'document';
  return 'other';
}
