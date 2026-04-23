import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, unauthorizedResponse } from '@/lib/auth-helpers';
import {
  getTransferTasks,
  type TransferStatusResponse,
} from '@/lib/transfer-types';

// GET /api/files/cross-driver-transfer/[taskId] - Get transfer status
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return unauthorizedResponse();
    }

    const { taskId } = await params;
    const tasks = getTransferTasks();
    const task = tasks.get(taskId);

    if (!task) {
      return NextResponse.json({ error: 'Transfer task not found' }, { status: 404 });
    }

    const progress = task.totalFiles > 0
      ? Math.round((task.processedFiles / task.totalFiles) * 100)
      : 0;

    const bytesProgress = task.totalBytes > 0
      ? Math.round((task.transferredBytes / task.totalBytes) * 100)
      : 0;

    const duration = task.completedAt
      ? task.completedAt - task.startedAt
      : Date.now() - task.startedAt;

    // Convert fileResults Map to array for JSON serialization
    const fileResults = Array.from(task.fileResults.values()).map(r => ({
      fileId: r.fileId,
      fileName: r.fileName,
      status: r.status,
      bytesTransferred: r.bytesTransferred,
      error: r.error,
    }));

    const response: TransferStatusResponse = {
      taskId: task.id,
      status: task.status,
      progress,
      bytesProgress,
      totalFiles: task.totalFiles,
      processedFiles: task.processedFiles,
      succeededFiles: task.succeededFiles,
      failedFiles: task.failedFiles,
      totalBytes: task.totalBytes,
      transferredBytes: task.transferredBytes,
      errors: task.errors,
      duration,
      mode: task.mode,
      sourceDriverId: task.sourceDriverId,
      targetDriverId: task.targetDriverId,
      fileResults,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error getting transfer status:', error);
    return NextResponse.json({ error: 'Failed to get transfer status' }, { status: 500 });
  }
}

// DELETE /api/files/cross-driver-transfer/[taskId] - Cancel a running transfer
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return unauthorizedResponse();
    }

    const { taskId } = await params;
    const tasks = getTransferTasks();
    const task = tasks.get(taskId);

    if (!task) {
      return NextResponse.json({ error: 'Transfer task not found' }, { status: 404 });
    }

    // Can only cancel pending or in_progress tasks
    if (task.status !== 'pending' && task.status !== 'in_progress') {
      return NextResponse.json(
        { error: `Cannot cancel task in "${task.status}" status` },
        { status: 400 }
      );
    }

    task.status = 'cancelled';
    task.completedAt = Date.now();

    const progress = task.totalFiles > 0
      ? Math.round((task.processedFiles / task.totalFiles) * 100)
      : 0;

    return NextResponse.json({
      taskId: task.id,
      status: task.status,
      message: 'Transfer cancelled',
      progress,
      processedFiles: task.processedFiles,
      succeededFiles: task.succeededFiles,
      failedFiles: task.failedFiles,
      totalFiles: task.totalFiles,
    });
  } catch (error) {
    console.error('Error cancelling transfer:', error);
    return NextResponse.json({ error: 'Failed to cancel transfer' }, { status: 500 });
  }
}
