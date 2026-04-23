import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, unauthorizedResponse } from '@/lib/auth-helpers';

// GET /api/tasks — List all active tasks for the current user
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return unauthorizedResponse();
    }
    const userId = (user as Record<string, unknown>).id as string;
    const isAdmin = (user as Record<string, unknown>).role === 'admin';

    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status'); // filter by status
    const type = searchParams.get('type'); // filter by type
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Build where clause
    const where: Record<string, unknown> = {};
    if (!isAdmin) {
      where.userId = userId;
    }
    if (status) {
      where.status = status;
    }
    if (type) {
      where.type = type;
    }

    const tasks = await db.taskRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    const total = await db.taskRecord.count({ where });

    // Normalize task records
    const normalized = tasks.map((t) => ({
      id: t.id,
      userId: t.userId,
      type: t.type,
      status: t.status,
      progress: t.progress,
      fileName: t.fileName,
      fileSize: t.fileSize,
      totalSize: t.totalSize,
      chunkIndex: t.chunkIndex,
      totalChunks: t.totalChunks,
      uploadId: t.uploadId,
      sourcePath: t.sourcePath,
      destPath: t.destPath,
      sourceDriverId: t.sourceDriverId,
      destDriverId: t.destDriverId,
      speed: t.speed,
      error: t.error,
      metadata: JSON.parse(t.metadata || '{}'),
      startedAt: t.startedAt?.toISOString() ?? null,
      completedAt: t.completedAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    }));

    return NextResponse.json({
      tasks: normalized,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error listing tasks:', error);
    return NextResponse.json(
      { error: 'Failed to list tasks' },
      { status: 500 }
    );
  }
}

// DELETE /api/tasks — Cancel/clear tasks
export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return unauthorizedResponse();
    }
    const userId = (user as Record<string, unknown>).id as string;
    const isAdmin = (user as Record<string, unknown>).role === 'admin';

    const { searchParams } = request.nextUrl;
    const taskId = searchParams.get('id'); // specific task ID
    const clearStatus = searchParams.get('clear'); // "completed", "failed", "all"

    // Delete a specific task
    if (taskId) {
      const task = await db.taskRecord.findUnique({ where: { id: taskId } });
      if (!task) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }
      if (!isAdmin && task.userId !== userId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      // If task is running, mark as cancelled instead of deleting
      if (task.status === 'running') {
        await db.taskRecord.update({
          where: { id: taskId },
          data: { status: 'cancelled', error: 'Cancelled by user' },
        });
        return NextResponse.json({ success: true, action: 'cancelled' });
      }

      await db.taskRecord.delete({ where: { id: taskId } });
      return NextResponse.json({ success: true, action: 'deleted' });
    }

    // Clear tasks by status
    if (clearStatus) {
      const where: Record<string, unknown> = {};
      if (!isAdmin) {
        where.userId = userId;
      }

      if (clearStatus === 'completed') {
        where.status = 'completed';
      } else if (clearStatus === 'failed') {
        where.status = 'failed';
      } else if (clearStatus === 'cancelled') {
        where.status = 'cancelled';
      } else if (clearStatus === 'all') {
        // Delete all non-running tasks
        where.status = { in: ['completed', 'failed', 'cancelled', 'pending', 'paused'] };
      } else {
        return NextResponse.json(
          { error: 'Invalid clear parameter. Use "completed", "failed", "cancelled", or "all"' },
          { status: 400 }
        );
      }

      const result = await db.taskRecord.deleteMany({ where });
      return NextResponse.json({ success: true, deleted: result.count });
    }

    return NextResponse.json(
      { error: 'Provide either id or clear parameter' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error deleting tasks:', error);
    return NextResponse.json(
      { error: 'Failed to delete tasks' },
      { status: 500 }
    );
  }
}

// PATCH /api/tasks — Update task status (pause, resume, retry)
export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return unauthorizedResponse();
    }
    const userId = (user as Record<string, unknown>).id as string;
    const isAdmin = (user as Record<string, unknown>).role === 'admin';

    const body = await request.json();
    const { id, action } = body as { id: string; action: 'pause' | 'resume' | 'retry' | 'cancel' };

    if (!id || !action) {
      return NextResponse.json(
        { error: 'id and action are required' },
        { status: 400 }
      );
    }

    const task = await db.taskRecord.findUnique({ where: { id } });
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    if (!isAdmin && task.userId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let updateData: Record<string, unknown> = {};

    switch (action) {
      case 'pause':
        if (task.status !== 'running') {
          return NextResponse.json({ error: 'Can only pause running tasks' }, { status: 400 });
        }
        updateData = { status: 'paused' };
        break;

      case 'resume':
        if (task.status !== 'paused') {
          return NextResponse.json({ error: 'Can only resume paused tasks' }, { status: 400 });
        }
        updateData = { status: 'pending' };
        break;

      case 'retry':
        if (task.status !== 'failed' && task.status !== 'cancelled') {
          return NextResponse.json({ error: 'Can only retry failed or cancelled tasks' }, { status: 400 });
        }
        updateData = { status: 'pending', progress: 0, error: null, startedAt: null };
        break;

      case 'cancel':
        if (task.status === 'completed' || task.status === 'cancelled') {
          return NextResponse.json({ error: 'Cannot cancel completed or already cancelled tasks' }, { status: 400 });
        }
        updateData = { status: 'cancelled', error: 'Cancelled by user' };
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use pause, resume, retry, or cancel' },
          { status: 400 }
        );
    }

    const updated = await db.taskRecord.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      progress: updated.progress,
      error: updated.error,
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('Error updating task:', error);
    return NextResponse.json(
      { error: 'Failed to update task' },
      { status: 500 }
    );
  }
}
