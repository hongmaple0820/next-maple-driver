import { NextRequest, NextResponse } from 'next/server';

// In-memory transfer task tracking (shared with parent route via module)
// We need to import the shared transfer tasks
// Since Next.js route handlers are separate modules, we use a shared store

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

// Shared in-memory store (imported from parent route module doesn't work in Next.js)
// So we use a global store approach
const globalForTransferTasks = globalThis as unknown as {
  crossDriverTransferTasks: Map<string, TransferTask> | undefined;
};

function getTransferTasks(): Map<string, TransferTask> {
  if (!globalForTransferTasks.crossDriverTransferTasks) {
    globalForTransferTasks.crossDriverTransferTasks = new Map();
  }
  return globalForTransferTasks.crossDriverTransferTasks;
}

// GET /api/files/cross-driver-transfer/[taskId] - Check transfer progress
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const tasks = getTransferTasks();
    const task = tasks.get(taskId);

    if (!task) {
      return NextResponse.json({ error: 'Transfer task not found' }, { status: 404 });
    }

    const progress = task.totalFiles > 0
      ? Math.round((task.processedFiles / task.totalFiles) * 100)
      : 0;

    return NextResponse.json({
      taskId: task.id,
      status: task.status,
      progress,
      totalFiles: task.totalFiles,
      processedFiles: task.processedFiles,
      succeededFiles: task.succeededFiles,
      failedFiles: task.failedFiles,
      errors: task.errors.slice(-10), // Last 10 errors only
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      duration: task.completedAt
        ? task.completedAt - task.startedAt
        : Date.now() - task.startedAt,
    });
  } catch (error) {
    console.error('Error checking transfer status:', error);
    return NextResponse.json({ error: 'Failed to check transfer status' }, { status: 500 });
  }
}
