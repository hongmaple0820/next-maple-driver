import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// POST /api/files/move - Move file to another folder
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, targetParentId } = body;

    if (!id || !targetParentId) {
      return NextResponse.json(
        { error: 'File ID and target parent ID are required' },
        { status: 400 }
      );
    }

    const file = await db.fileItem.findUnique({ where: { id } });
    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const actualTargetId = targetParentId === 'root' ? null : targetParentId;

    // If target is not root, verify the target folder exists
    if (actualTargetId !== null) {
      const targetFolder = await db.fileItem.findUnique({
        where: { id: actualTargetId },
      });
      if (!targetFolder) {
        return NextResponse.json(
          { error: 'Target folder not found' },
          { status: 404 }
        );
      }
      if (targetFolder.type !== 'folder') {
        return NextResponse.json(
          { error: 'Target must be a folder' },
          { status: 400 }
        );
      }
      // Prevent moving a folder into its own descendant
      if (await isDescendant(actualTargetId, id)) {
        return NextResponse.json(
          { error: 'Cannot move a folder into its own subfolder' },
          { status: 400 }
        );
      }
    }

    // Check for duplicate name in target folder
    const existing = await db.fileItem.findFirst({
      where: {
        parentId: actualTargetId,
        name: file.name,
        isTrashed: false,
        id: { not: id },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'A file with this name already exists in the target folder' },
        { status: 409 }
      );
    }

    const updated = await db.fileItem.update({
      where: { id },
      data: { parentId: actualTargetId },
    });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      type: updated.type,
      parentId: updated.parentId ?? 'root',
    });
  } catch (error) {
    console.error('Error moving file:', error);
    return NextResponse.json(
      { error: 'Failed to move file' },
      { status: 500 }
    );
  }
}

// Check if targetId is a descendant of parentId
async function isDescendant(
  targetId: string,
  ancestorId: string
): Promise<boolean> {
  if (targetId === ancestorId) return true;

  const children = await db.fileItem.findMany({
    where: { parentId: ancestorId, type: 'folder' },
    select: { id: true },
  });

  for (const child of children) {
    if (await isDescendant(targetId, child.id)) {
      return true;
    }
  }

  return false;
}
