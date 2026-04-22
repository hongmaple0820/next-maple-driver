import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, unauthorizedResponse } from '@/lib/auth-helpers';

// GET /api/files/stats - Storage statistics
export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return unauthorizedResponse();
    }
    const userId = (user as Record<string, unknown>).id as string;
    const isAdmin = (user as Record<string, unknown>).role === 'admin';

    // Build user filter - admins see all files, regular users see only their own
    const userFilter = isAdmin ? {} : { userId };

    const [totalFiles, totalFolders, starredCount, trashedCount, allFiles] =
      await Promise.all([
        db.fileItem.count({ where: { type: 'file', isTrashed: false, ...userFilter } }),
        db.fileItem.count({ where: { type: 'folder', isTrashed: false, ...userFilter } }),
        db.fileItem.count({ where: { isStarred: true, isTrashed: false, ...userFilter } }),
        db.fileItem.count({ where: { isTrashed: true, ...userFilter } }),
        db.fileItem.findMany({
          where: { type: 'file', isTrashed: false, ...userFilter },
          select: { size: true, mimeType: true },
        }),
      ]);

    const usedBytes = allFiles.reduce((sum, file) => sum + file.size, 0);
    const totalBytes = 10737418240; // 10 GB

    // Group by type
    const byType: Record<string, number> = {};
    for (const file of allFiles) {
      const type = getTypeCategory(file.mimeType);
      byType[type] = (byType[type] || 0) + file.size;
    }

    return NextResponse.json({
      totalFiles,
      totalFolders,
      usedBytes,
      totalBytes,
      starredCount,
      trashedCount,
      byType,
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    return NextResponse.json(
      { error: 'Failed to get storage statistics' },
      { status: 500 }
    );
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
