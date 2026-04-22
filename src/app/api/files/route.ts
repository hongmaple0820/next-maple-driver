import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, unauthorizedResponse } from '@/lib/auth-helpers';

// GET /api/files - List files
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return unauthorizedResponse();
    }
    const userId = (user as Record<string, unknown>).id as string;
    const isAdmin = (user as Record<string, unknown>).role === 'admin';

    const { searchParams } = request.nextUrl;
    const parentIdParam = searchParams.get('parentId') || 'root';
    const trashed = searchParams.get('trashed') === 'true';
    const starred = searchParams.get('starred') === 'true';

    // "root" means top-level (parentId is null)
    const parentId = parentIdParam === 'root' ? null : parentIdParam;

    const where: Record<string, unknown> = {
      isTrashed: trashed,
    };

    if (!isAdmin) {
      where.userId = userId;
    }

    if (starred) {
      where.isStarred = true;
      // Don't filter by parentId for starred items - show all
    } else {
      where.parentId = parentId;
    }

    const files = await db.fileItem.findMany({
      where,
      include: {
        _count: {
          select: { children: true },
        },
      },
      orderBy: [{ type: 'desc' }, { name: 'asc' }],
    });

    const result = files.map((file) => ({
      id: file.id,
      name: file.name,
      type: file.type,
      size: file.size,
      mimeType: file.mimeType,
      parentId: file.parentId ?? 'root',
      starred: file.isStarred,
      trashed: file.isTrashed,
      description: file.description,
      colorLabel: file.colorLabel || "",
      createdAt: file.createdAt.toISOString(),
      updatedAt: file.updatedAt.toISOString(),
      childrenCount: file._count.children,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error listing files:', error);
    return NextResponse.json(
      { error: 'Failed to list files' },
      { status: 500 }
    );
  }
}

// POST /api/files - Create folder
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return unauthorizedResponse();
    }
    const userId = (user as Record<string, unknown>).id as string;

    const body = await request.json();
    const { name, parentId: parentIdParam = 'root' } = body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json(
        { error: 'Folder name is required' },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();
    const parentId = parentIdParam === 'root' ? null : parentIdParam;

    // Check for duplicate name in same parent
    const existing = await db.fileItem.findFirst({
      where: {
        parentId,
        name: trimmedName,
        isTrashed: false,
        userId,
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'A folder with this name already exists' },
        { status: 409 }
      );
    }

    const folder = await db.fileItem.create({
      data: {
        name: trimmedName,
        type: 'folder',
        parentId,
        userId,
      },
    });

    return NextResponse.json({
      id: folder.id,
      name: folder.name,
      type: folder.type,
      size: folder.size,
      mimeType: folder.mimeType,
      parentId: folder.parentId ?? 'root',
      starred: folder.isStarred,
      trashed: folder.isTrashed,
      createdAt: folder.createdAt.toISOString(),
      updatedAt: folder.updatedAt.toISOString(),
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating folder:', error);
    return NextResponse.json(
      { error: 'Failed to create folder' },
      { status: 500 }
    );
  }
}

// PUT /api/files - Rename file/folder
export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return unauthorizedResponse();
    }
    const userId = (user as Record<string, unknown>).id as string;
    const isAdmin = (user as Record<string, unknown>).role === 'admin';

    const body = await request.json();
    const { id, name } = body;

    if (!id || !name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json(
        { error: 'File ID and new name are required' },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();

    const file = await db.fileItem.findUnique({ where: { id } });
    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Verify ownership (unless admin)
    if (!isAdmin && file.userId !== userId) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Check for duplicate name in same parent
    const existing = await db.fileItem.findFirst({
      where: {
        parentId: file.parentId,
        name: trimmedName,
        isTrashed: false,
        id: { not: id },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'A file with this name already exists in the same location' },
        { status: 409 }
      );
    }

    const updated = await db.fileItem.update({
      where: { id },
      data: { name: trimmedName },
    });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      type: updated.type,
      size: updated.size,
      mimeType: updated.mimeType,
      parentId: updated.parentId ?? 'root',
      starred: updated.isStarred,
      trashed: updated.isTrashed,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('Error renaming file:', error);
    return NextResponse.json(
      { error: 'Failed to rename file' },
      { status: 500 }
    );
  }
}

// PATCH /api/files - Update file/folder metadata (description, etc.)
export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return unauthorizedResponse();
    }
    const userId = (user as Record<string, unknown>).id as string;
    const isAdmin = (user as Record<string, unknown>).role === 'admin';

    const body = await request.json();
    const { id, description, colorLabel } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'File ID is required' },
        { status: 400 }
      );
    }

    const file = await db.fileItem.findUnique({ where: { id } });
    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Verify ownership (unless admin)
    if (!isAdmin && file.userId !== userId) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (description !== undefined) {
      data.description = description;
    }
    if (colorLabel !== undefined) {
      data.colorLabel = colorLabel;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    const updated = await db.fileItem.update({
      where: { id },
      data,
    });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      type: updated.type,
      size: updated.size,
      mimeType: updated.mimeType,
      parentId: updated.parentId ?? 'root',
      starred: updated.isStarred,
      trashed: updated.isTrashed,
      description: updated.description,
      colorLabel: updated.colorLabel || "",
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('Error updating file metadata:', error);
    return NextResponse.json(
      { error: 'Failed to update file metadata' },
      { status: 500 }
    );
  }
}

// DELETE /api/files - Delete file/folder (move to trash or permanent delete)
export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return unauthorizedResponse();
    }
    const userId = (user as Record<string, unknown>).id as string;
    const isAdmin = (user as Record<string, unknown>).role === 'admin';

    const body = await request.json();
    const { id, permanent = false } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'File ID is required' },
        { status: 400 }
      );
    }

    const file = await db.fileItem.findUnique({ where: { id } });
    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Verify ownership (unless admin)
    if (!isAdmin && file.userId !== userId) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    if (permanent) {
      await deleteFileRecursively(id);
      return NextResponse.json({ message: 'File permanently deleted' });
    } else {
      await trashFileRecursively(id);
      return NextResponse.json({ message: 'File moved to trash' });
    }
  } catch (error) {
    console.error('Error deleting file:', error);
    return NextResponse.json(
      { error: 'Failed to delete file' },
      { status: 500 }
    );
  }
}

async function trashFileRecursively(id: string) {
  const children = await db.fileItem.findMany({
    where: { parentId: id },
    select: { id: true },
  });

  for (const child of children) {
    await trashFileRecursively(child.id);
  }

  await db.fileItem.update({
    where: { id },
    data: { isTrashed: true },
  });
}

async function deleteFileRecursively(id: string) {
  const { unlink } = await import('fs/promises');
  const { join } = await import('path');

  const children = await db.fileItem.findMany({
    where: { parentId: id },
    select: { id: true },
  });

  for (const child of children) {
    await deleteFileRecursively(child.id);
  }

  const file = await db.fileItem.findUnique({ where: { id } });

  if (file && file.type === 'file' && file.storagePath) {
    const STORAGE_PATH = join(process.cwd(), 'storage');
    const filePath = join(STORAGE_PATH, file.storagePath);
    try {
      await unlink(filePath);
    } catch {
      // File might already be deleted
    }
  }

  await db.fileItem.delete({ where: { id } });
}
