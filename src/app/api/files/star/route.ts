import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// POST /api/files/star - Star/unstar file
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, starred } = body;

    if (!id || typeof starred !== 'boolean') {
      return NextResponse.json(
        { error: 'File ID and starred boolean are required' },
        { status: 400 }
      );
    }

    const file = await db.fileItem.findUnique({ where: { id } });
    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const updated = await db.fileItem.update({
      where: { id },
      data: { isStarred: starred },
    });

    return NextResponse.json({ file: updated });
  } catch (error) {
    console.error('Error starring file:', error);
    return NextResponse.json(
      { error: 'Failed to update star status' },
      { status: 500 }
    );
  }
}
