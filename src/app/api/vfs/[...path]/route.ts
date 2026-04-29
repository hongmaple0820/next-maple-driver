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
        return NextResponse.json({ error: '未找到该路径' }, { status: 404 });
      }
      return NextResponse.json({ info });
    }

    // Get download link
    if (action === 'download') {
      const link = await getVirtualDownloadLink(virtualPath);
      if (!link) {
        return NextResponse.json({ error: '无法获取下载链接' }, { status: 404 });
      }
      return NextResponse.json({ url: link });
    }

    // Default: list directory
    const result = await listVirtualDir(virtualPath);
    return NextResponse.json({
      path: result.path,
      items: result.items.map((item) => ({
        name: item.name,
        size: item.size,
        isDir: item.isDir,
        lastModified: item.lastModified?.toISOString() ?? null,
        id: item.id ?? null,
        mimeType: item.mimeType ?? null,
      })),
      mountPoint: result.mountPoint
        ? {
            driverId: result.mountPoint.driverId,
            driverType: result.mountPoint.driverType,
            driverName: result.mountPoint.driverName,
            isReadOnly: result.mountPoint.isReadOnly,
            authStatus: result.mountPoint.authStatus,
          }
        : undefined,
    });
  } catch (error) {
    console.error('VFS GET error:', error);

    // Check for auth-related errors
    if (error instanceof Error) {
      const errWithCode = error as Error & { code?: string; mountPoint?: unknown };
      if (errWithCode.code === 'AUTH_REQUIRED' || errWithCode.code === 'AUTH_EXPIRED') {
        return NextResponse.json(
          {
            error: error.message,
            code: errWithCode.code,
            mountPoint: errWithCode.mountPoint,
          },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : '内部错误' },
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
        return NextResponse.json({ error: '未找到挂载点' }, { status: 404 });
      }
      if (resolved.mountPoint.isReadOnly) {
        return NextResponse.json({ error: '该挂载点为只读' }, { status: 403 });
      }
      await resolved.driver.createDir(resolved.realPath);
      invalidateMountCache(resolved.mountPoint.mountPath);
      return NextResponse.json({ success: true, path: virtualPath });
    }

    if (action === 'upload') {
      const formData = await request.formData();
      const file = formData.get('file') as File;
      if (!file) {
        return NextResponse.json({ error: '未提供文件' }, { status: 400 });
      }
      const data = Buffer.from(await file.arrayBuffer());
      const filePath = virtualPath + '/' + file.name;
      await writeVirtualFile(filePath, data);
      return NextResponse.json({ success: true, path: filePath });
    }

    return NextResponse.json({ error: '未知操作' }, { status: 400 });
  } catch (error) {
    console.error('VFS POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '内部错误' },
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
    return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
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
      { error: error instanceof Error ? error.message : '内部错误' },
      { status: 500 }
    );
  }
}
