import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, unauthorizedResponse } from '@/lib/auth-helpers';

// Import the shared transfer task type and global
interface TransferTask {
  id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  totalFiles: number;
  processedFiles: number;
  succeededFiles: number;
  failedFiles: number;
  errors: string[];
  startedAt: number;
  completedAt?: number;
}

const globalForTransferTasks = globalThis as unknown as {
  crossDriverTransferTasks: Map<string, TransferTask> | undefined;
};

function getTransferTasks(): Map<string, TransferTask> {
  if (!globalForTransferTasks.crossDriverTransferTasks) {
    globalForTransferTasks.crossDriverTransferTasks = new Map();
  }
  return globalForTransferTasks.crossDriverTransferTasks;
}

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

    const duration = task.completedAt
      ? task.completedAt - task.startedAt
      : Date.now() - task.startedAt;

    return NextResponse.json({
      taskId: task.id,
      status: task.status,
      progress,
      totalFiles: task.totalFiles,
      processedFiles: task.processedFiles,
      succeededFiles: task.succeededFiles,
      failedFiles: task.failedFiles,
      errors: task.errors,
      duration,
    });
  } catch (error) {
    console.error('Error getting transfer status:', error);
    return NextResponse.json({ error: 'Failed to get transfer status' }, { status: 500 });
  }
}
