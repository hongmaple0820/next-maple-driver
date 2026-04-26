import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, unauthorizedResponse } from '@/lib/auth-helpers';
import {
  getTransferTasks,
  type TransferStatusResponse,
} from '@/lib/transfer-types';
import {
  getTransferTask as getEngineTask,
  cancelTransferTask as cancelEngineTask,
} from '@/lib/transfer-engine';

// GET /api/files/cross-driver-transfer/[taskId] - Get transfer status
// Supports both legacy (file-ID based) and new engine (VFS-based) tasks
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

    // Try the legacy task store first
    const tasks = getTransferTasks();
    const legacyTask = tasks.get(taskId);

    if (legacyTask) {
      const progress = legacyTask.totalFiles > 0
        ? Math.round((legacyTask.processedFiles / legacyTask.totalFiles) * 100)
        : 0;

      const bytesProgress = legacyTask.totalBytes > 0
        ? Math.round((legacyTask.transferredBytes / legacyTask.totalBytes) * 100)
        : 0;

      const duration = legacyTask.completedAt
        ? legacyTask.completedAt - legacyTask.startedAt
        : Date.now() - legacyTask.startedAt;

      const speed = (legacyTask as Record<string, unknown>).speed as number | undefined;
      const byteLevelProgress = (legacyTask as Record<string, unknown>).progress as number | undefined;

      // Convert fileResults Map to array for JSON serialization
      const fileResults = Array.from(legacyTask.fileResults.values()).map(r => ({
        fileId: r.fileId,
        fileName: r.fileName,
        status: r.status,
        bytesTransferred: r.bytesTransferred,
        error: r.error,
      }));

      const response: TransferStatusResponse & { speed?: number; byteProgress?: number } = {
        taskId: legacyTask.id,
        status: legacyTask.status,
        progress,
        bytesProgress,
        totalFiles: legacyTask.totalFiles,
        processedFiles: legacyTask.processedFiles,
        succeededFiles: legacyTask.succeededFiles,
        failedFiles: legacyTask.failedFiles,
        totalBytes: legacyTask.totalBytes,
        transferredBytes: legacyTask.transferredBytes,
        errors: legacyTask.errors,
        duration,
        mode: legacyTask.mode,
        sourceDriverId: legacyTask.sourceDriverId,
        targetDriverId: legacyTask.targetDriverId,
        fileResults,
        speed,
        byteProgress: byteLevelProgress,
      };

      return NextResponse.json(response);
    }

    // Try the new transfer engine task store
    const engineTask = getEngineTask(taskId);
    if (engineTask) {
      const duration = engineTask.completedAt
        ? engineTask.completedAt - (engineTask.startedAt || engineTask.completedAt)
        : engineTask.startedAt
          ? Date.now() - engineTask.startedAt
          : 0;

      return NextResponse.json({
        taskId: engineTask.id,
        status: engineTask.status,
        progress: engineTask.progress,
        bytesProgress: engineTask.totalBytes > 0
          ? Math.round((engineTask.transferredBytes / engineTask.totalBytes) * 100)
          : 0,
        totalFiles: engineTask.totalFiles,
        processedFiles: engineTask.processedFiles,
        succeededFiles: engineTask.succeededFiles,
        failedFiles: engineTask.failedFiles,
        totalBytes: engineTask.totalBytes,
        transferredBytes: engineTask.transferredBytes,
        errors: engineTask.errors,
        duration,
        mode: engineTask.operation,
        sourceDriverId: engineTask.sourceDriverId,
        targetDriverId: engineTask.destDriverId,
        currentFile: engineTask.currentFile,
        speed: engineTask.speed,
        fileResults: engineTask.results.map(r => ({
          fileId: r.fileName,
          fileName: r.fileName,
          status: r.status,
          bytesTransferred: r.bytesTransferred,
          error: r.error,
        })),
      });
    }

    return NextResponse.json({ error: 'Transfer task not found' }, { status: 404 });
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

    // Try legacy task store
    const tasks = getTransferTasks();
    const legacyTask = tasks.get(taskId);

    if (legacyTask) {
      // Can only cancel pending or in_progress tasks
      if (legacyTask.status !== 'pending' && legacyTask.status !== 'in_progress') {
        return NextResponse.json(
          { error: `Cannot cancel task in "${legacyTask.status}" status` },
          { status: 400 }
        );
      }

      legacyTask.status = 'cancelled';
      legacyTask.completedAt = Date.now();

      const progress = legacyTask.totalFiles > 0
        ? Math.round((legacyTask.processedFiles / legacyTask.totalFiles) * 100)
        : 0;

      return NextResponse.json({
        taskId: legacyTask.id,
        status: legacyTask.status,
        message: 'Transfer cancelled',
        progress,
        processedFiles: legacyTask.processedFiles,
        succeededFiles: legacyTask.succeededFiles,
        failedFiles: legacyTask.failedFiles,
        totalFiles: legacyTask.totalFiles,
      });
    }

    // Try new transfer engine task store
    const cancelled = cancelEngineTask(taskId);
    if (cancelled) {
      const engineTask = getEngineTask(taskId);
      return NextResponse.json({
        taskId,
        status: 'cancelled',
        message: 'Transfer cancelled',
        progress: engineTask?.progress ?? 0,
        processedFiles: engineTask?.processedFiles ?? 0,
        succeededFiles: engineTask?.succeededFiles ?? 0,
        failedFiles: engineTask?.failedFiles ?? 0,
        totalFiles: engineTask?.totalFiles ?? 0,
      });
    }

    return NextResponse.json({ error: 'Transfer task not found' }, { status: 404 });
  } catch (error) {
    console.error('Error cancelling transfer:', error);
    return NextResponse.json({ error: 'Failed to cancel transfer' }, { status: 500 });
  }
}
