import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, unauthorizedResponse } from '@/lib/auth-helpers';

// MIME type / extension mapping for type filters
const TYPE_FILTERS: Record<string, { mimePrefixes: string[]; mimeIncludes: string[]; extensions: string[] }> = {
  images: {
    mimePrefixes: ['image/'],
    mimeIncludes: [],
    extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff', 'tif'],
  },
  videos: {
    mimePrefixes: ['video/'],
    mimeIncludes: [],
    extensions: ['mp4', 'webm', 'avi', 'mov', 'mkv', 'flv', 'wmv', 'm4v'],
  },
  audio: {
    mimePrefixes: ['audio/'],
    mimeIncludes: [],
    extensions: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma'],
  },
  documents: {
    mimePrefixes: [],
    mimeIncludes: ['document', 'word', 'pdf', 'text/plain', 'spreadsheet', 'excel', 'presentation'],
    extensions: ['doc', 'docx', 'pdf', 'txt', 'rtf', 'xls', 'xlsx', 'csv', 'odt', 'ods', 'ppt', 'pptx'],
  },
  code: {
    mimePrefixes: [],
    mimeIncludes: ['json', 'javascript', 'typescript', 'xml', 'html', 'css'],
    extensions: [
      'js', 'ts', 'tsx', 'jsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp',
      'h', 'cs', 'php', 'swift', 'kt', 'sh', 'bash', 'zsh', 'yaml', 'yml',
      'toml', 'json', 'xml', 'html', 'css', 'scss', 'less', 'sql', 'md',
      'vue', 'svelte',
    ],
  },
  archives: {
    mimePrefixes: [],
    mimeIncludes: ['zip', 'rar', 'tar', 'gzip', '7z', 'compressed'],
    extensions: ['zip', 'rar', 'tar', 'gz', 'bz2', '7z', 'xz', 'tgz'],
  },
};

// Date range calculation
function getDateRange(filter: string): { gte?: Date; lte?: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (filter) {
    case 'today':
      return { gte: today };
    case 'week': {
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return { gte: weekAgo };
    }
    case 'month': {
      const monthAgo = new Date(today);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      return { gte: monthAgo };
    }
    case 'year': {
      const yearAgo = new Date(today);
      yearAgo.setFullYear(yearAgo.getFullYear() - 1);
      return { gte: yearAgo };
    }
    default:
      return {};
  }
}

// Size range calculation (in bytes)
function getSizeRange(filter: string): { min?: number; max?: number } {
  switch (filter) {
    case 'small': // < 1MB
      return { min: 0, max: 1048575 };
    case 'medium': // 1MB - 100MB
      return { min: 1048576, max: 104857599 };
    case 'large': // > 100MB
      return { min: 104857600 };
    default:
      return {};
  }
}

// Check if a file matches a type filter
function matchesFileType(mimeType: string, name: string, typeFilter: string): boolean {
  const filter = TYPE_FILTERS[typeFilter];
  if (!filter) return true;

  const ext = name.includes('.') ? name.split('.').pop()?.toLowerCase() || '' : '';
  const mime = mimeType.toLowerCase();

  if (filter.mimePrefixes.some((prefix) => mime.startsWith(prefix))) return true;
  if (filter.mimeIncludes.some((inc) => mime.includes(inc))) return true;
  if (filter.extensions.includes(ext)) return true;

  return false;
}

// GET /api/files/search - Advanced search files
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return unauthorizedResponse();
    }
    const userId = (user as Record<string, unknown>).id as string;
    const isAdmin = (user as Record<string, unknown>).role === 'admin';

    const { searchParams } = request.nextUrl;
    const query = searchParams.get('q') || '';
    const typeFilter = searchParams.get('type') || ''; // images, videos, audio, documents, code, archives
    const dateFilter = searchParams.get('date') || ''; // today, week, month, year
    const sizeFilter = searchParams.get('size') || ''; // small, medium, large
    const groupBy = searchParams.get('group') || ''; // if 'type', return grouped results

    // Build where clause
    const where: Record<string, unknown> = {
      isTrashed: false,
    };

    if (!isAdmin) {
      where.userId = userId;
    }

    // Name search
    if (query.trim()) {
      where.name = {
        contains: query.trim(),
      };
    }

    // Date range filter
    if (dateFilter) {
      const dateRange = getDateRange(dateFilter);
      if (dateRange.gte || dateRange.lte) {
        where.updatedAt = {
          ...(dateRange.gte ? { gte: dateRange.gte } : {}),
          ...(dateRange.lte ? { lte: dateRange.lte } : {}),
        };
      }
    }

    // Size range filter (only applies to files, not folders)
    if (sizeFilter) {
      const sizeRange = getSizeRange(sizeFilter);
      if (sizeRange.min !== undefined || sizeRange.max !== undefined) {
        where.size = {
          ...(sizeRange.min !== undefined ? { gte: sizeRange.min } : {}),
          ...(sizeRange.max !== undefined ? { lte: sizeRange.max } : {}),
        };
        where.type = 'file';
      }
    }

    // Type filter via MIME type / extension (done in post-processing for SQLite compatibility)
    const needsTypeFilter = typeFilter && TYPE_FILTERS[typeFilter];

    const files = await db.fileItem.findMany({
      where,
      include: {
        _count: {
          select: { children: { where: { isTrashed: false } } },
        },
      },
      take: 200,
      orderBy: [{ type: 'desc' }, { name: 'asc' }],
    });

    // Apply type filter in post-processing
    let filtered = needsTypeFilter
      ? files.filter((f) => matchesFileType(f.mimeType, f.name, typeFilter))
      : files;

    // Build result objects
    const result = filtered.map((file) => ({
      id: file.id,
      name: file.name,
      type: file.type,
      size: file.size,
      mimeType: file.mimeType,
      parentId: file.parentId ?? 'root',
      starred: file.isStarred,
      trashed: file.isTrashed,
      colorLabel: file.colorLabel,
      driverId: file.driverId,
      createdAt: file.createdAt.toISOString(),
      updatedAt: file.updatedAt.toISOString(),
      childrenCount: file._count.children,
    }));

    // If grouped response is requested
    if (groupBy === 'type') {
      const groups: Record<string, typeof result> = {
        folders: [],
        images: [],
        videos: [],
        audio: [],
        documents: [],
        code: [],
        archives: [],
        other: [],
      };

      for (const file of result) {
        if (file.type === 'folder') {
          groups.folders.push(file);
        } else {
          let placed = false;
          for (const [category, filter] of Object.entries(TYPE_FILTERS)) {
            if (matchesFileType(file.mimeType || '', file.name, category)) {
              groups[category].push(file);
              placed = true;
              break;
            }
          }
          if (!placed) {
            groups.other.push(file);
          }
        }
      }

      // Build counts
      const counts: Record<string, number> = {};
      for (const [key, items] of Object.entries(groups)) {
        if (items.length > 0) {
          counts[key] = items.length;
        }
      }

      return NextResponse.json({
        results: result,
        groups,
        counts,
        total: result.length,
        query: query.trim(),
        filters: {
          type: typeFilter || null,
          date: dateFilter || null,
          size: sizeFilter || null,
        },
      });
    }

    // Standard (non-grouped) response - also include counts
    const counts: Record<string, number> = {};
    for (const file of result) {
      if (file.type === 'folder') {
        counts.folders = (counts.folders || 0) + 1;
      } else {
        let placed = false;
        for (const category of Object.keys(TYPE_FILTERS)) {
          if (matchesFileType(file.mimeType || '', file.name, category)) {
            counts[category] = (counts[category] || 0) + 1;
            placed = true;
            break;
          }
        }
        if (!placed) {
          counts.other = (counts.other || 0) + 1;
        }
      }
    }

    return NextResponse.json({
      results: result,
      counts,
      total: result.length,
      query: query.trim(),
      filters: {
        type: typeFilter || null,
        date: dateFilter || null,
        size: sizeFilter || null,
      },
    });
  } catch (error) {
    console.error('Error searching files:', error);
    return NextResponse.json(
      { error: 'Failed to search files' },
      { status: 500 }
    );
  }
}
