import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, unauthorizedResponse } from '@/lib/auth-helpers';
import { getMountPoints } from '@/lib/vfs';

// GET /api/vfs - Get mount points
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorizedResponse();

  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  try {
    // Get mount points listing
    if (action === 'mounts') {
      const mounts = await getMountPoints();
      return NextResponse.json({ mounts });
    }

    return NextResponse.json({ error: 'Unknown action. Use ?action=mounts' }, { status: 400 });
  } catch (error) {
    console.error('VFS root GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
