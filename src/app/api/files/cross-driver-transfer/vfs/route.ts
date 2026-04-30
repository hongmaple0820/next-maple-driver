import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, unauthorizedResponse } from '@/lib/auth-helpers';
import {
  startVFSTransfer,
  getTransferTask,
  getAllTransferTasks,
  cancelTransferTask,
  type TransferOperation,
  type TransferFileInfo,
} from '@/lib/transfer-engine';

// ---------------------------------------------------------------------------
// POST — Start a VFS-based cross-driver transfer
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorizedResponse();

  try {
    const body = await request.json();
    const { sourcePath, destPath, operation, sourceDriverId, destDriverId, files } =
      body;

    if (!sourcePath || !destPath) {
      return NextResponse.json(
        { error: 'sourcePath and destPath are required' },
        { status: 400 },
      );
    }

    if (!sourceDriverId || !destDriverId) {
      return NextResponse.json(
        { error: 'sourceDriverId and destDriverId are required' },
        { status: 400 },
      );
    }

    const op: TransferOperation = operation || 'copy';

    // If files are provided, use them directly
    let transferFiles: TransferFileInfo[] | undefined = files || undefined;

    const task = await startVFSTransfer({
      sourcePath,
      destPath,
      sourceDriverId,
      destDriverId,
      operation: op,
      files: transferFiles,
    });

    return NextResponse.json(
      {
        taskId: task.id,
        status: task.status,
        totalFiles: task.totalFiles,
        totalBytes: task.totalBytes,
        progress: task.progress,
      },
      { status: 202 },
    );
  } catch (error) {
    console.error('VFS transfer error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// GET — Get transfer task status (or list all tasks)
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorizedResponse();

  const url = new URL(request.url);
  const taskId = url.searchParams.get('taskId');

  if (taskId) {
    const task = getTransferTask(taskId);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    return NextResponse.json({
      id: task.id,
      status: task.status,
      operation: task.operation,
      totalFiles: task.totalFiles,
      totalBytes: task.totalBytes,
      processedFiles: task.processedFiles,
      succeededFiles: task.succeededFiles,
      failedFiles: task.failedFiles,
      transferredBytes: task.transferredBytes,
      currentFile: task.currentFile,
      speed: task.speed,
      progress: task.progress,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      results: task.results,
      errors: task.errors,
    });
  }

  // List all tasks
  const tasks = getAllTransferTasks();
  return NextResponse.json({
    tasks: tasks.map((t) => ({
      id: t.id,
      status: t.status,
      operation: t.operation,
      totalFiles: t.totalFiles,
      totalBytes: t.totalBytes,
      progress: t.progress,
      currentFile: t.currentFile,
      speed: t.speed,
      startedAt: t.startedAt,
      completedAt: t.completedAt,
    })),
  });
}

// ---------------------------------------------------------------------------
// DELETE — Cancel a transfer task
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorizedResponse();

  const url = new URL(request.url);
  const taskId = url.searchParams.get('taskId');

  if (!taskId) {
    return NextResponse.json(
      { error: 'taskId is required' },
      { status: 400 },
    );
  }

  const cancelled = cancelTransferTask(taskId);
  if (!cancelled) {
    return NextResponse.json(
      { error: 'Task not found or cannot be cancelled' },
      { status: 400 },
    );
  }

  return NextResponse.json({ success: true });
}
