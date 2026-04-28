import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, unauthorizedResponse } from '@/lib/auth-helpers';
import {
  listVirtualDir,
  readVirtualFile,
  writeVirtualFile,
  deleteVirtualFile,
  getVirtualFileInfo,
  getVirtualDownloadLink,
  getMountPoints,
  resolveVirtualPath,
  invalidateMountCache,
} from '@/lib/vfs';

// GET: List directory or get file info
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorizedResponse();

  const { path: pathSegments } = await params;
  const virtualPath = '/' + (pathSegments || []).join('/');

  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  try {
    // Get mount points listing
    if (action === 'mounts') {
      const mounts = await getMountPoints();
      return NextResponse.json({ mounts });
    }

    // Get file info
    if (action === 'info') {
      const info = await getVirtualFileInfo(virtualPath);
      if (!info) {
        return NextResponse.json({ error: 'Path not found' }, { status: 404 });
      }
      return NextResponse.json({ info });
    }

    // Get download link
    if (action === 'download') {
      const link = await getVirtualDownloadLink(virtualPath);
      if (!link) {
        return NextResponse.json({ error: 'No download link available' }, { status: 404 });
      }
      return NextResponse.json({ url: link });
    }

    // Default: list directory
    const items = await listVirtualDir(virtualPath);
    return NextResponse.json({ items, path: virtualPath });
  } catch (error) {
    console.error('VFS GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}

// POST: Create directory or upload file
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorizedResponse();

  const { path: pathSegments } = await params;
  const virtualPath = '/' + (pathSegments || []).join('/');
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  try {
    if (action === 'mkdir') {
      const resolved = await resolveVirtualPath(virtualPath);
      if (!resolved) {
        return NextResponse.json({ error: 'Mount point not found' }, { status: 404 });
      }
      if (resolved.mountPoint.isReadOnly) {
        return NextResponse.json({ error: 'Mount point is read-only' }, { status: 403 });
      }
      await resolved.driver.createDir(resolved.realPath);
      return NextResponse.json({ success: true, path: virtualPath });
    }

    if (action === 'upload') {
      const formData = await request.formData();
      const file = formData.get('file') as File;
      if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      }
      const data = Buffer.from(await file.arrayBuffer());
      const filePath = virtualPath + '/' + file.name;
      await writeVirtualFile(filePath, data);
      return NextResponse.json({ success: true, path: filePath });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('VFS POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}

// DELETE: Delete file or directory
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorizedResponse();
  const isAdmin = (user as Record<string, unknown>).role === 'admin';
  if (!isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { path: pathSegments } = await params;
  const virtualPath = '/' + (pathSegments || []).join('/');

  try {
    await deleteVirtualFile(virtualPath);
    invalidateMountCache();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('VFS DELETE error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
