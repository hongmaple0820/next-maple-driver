import { create } from "zustand";

// ──────────────────────────── Types ────────────────────────────

export type TaskType = "upload" | "download" | "move" | "copy" | "quick-transfer" | "transit";
export type TaskStatus = "pending" | "running" | "paused" | "completed" | "failed" | "cancelled";

export interface ChunkInfo {
  index: number;
  status: "pending" | "uploading" | "done" | "failed";
  retries: number;
}

export interface Task {
  id: string;
  type: TaskType;
  status: TaskStatus;
  progress: number; // 0-100
  fileName: string;
  fileSize: number;
  speed: number; // bytes per second
  error: string | null;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;

  // Chunked upload tracking
  uploadId: string | null;
  totalChunks: number;
  uploadedChunks: number;
  chunks: ChunkInfo[];

  // Move/copy metadata
  sourcePath: string | null;
  destPath: string | null;
  sourceDriverId: string | null;
  destDriverId: string | null;

  // Generic metadata
  metadata: Record<string, unknown>;

  // Abort controller reference for cancelling
  abortController: AbortController | null;

  // Queue position (for pending tasks)
  queuePosition: number;
}

// ──────────────────────────── Constants ────────────────────────────

const MAX_CONCURRENT_TASKS = 3;

// ──────────────────────────── Store Interface ────────────────────────────

interface TaskStore {
  tasks: Task[];
  maxConcurrent: number;

  // Getters (computed)
  getActiveTasks: () => Task[];
  getPendingTasks: () => Task[];
  getRunningTasks: () => Task[];
  getCompletedTasks: () => Task[];
  getFailedTasks: () => Task[];
  getTaskById: (id: string) => Task | undefined;
  getRunningCount: () => number;
  canStartMore: () => boolean;

  // Task CRUD
  addTask: (task: Omit<Task, "id" | "createdAt" | "startedAt" | "completedAt" | "queuePosition" | "abortController">) => string;
  updateTask: (id: string, updates: Partial<Task>) => void;
  removeTask: (id: string) => void;

  // Status transitions
  startTask: (id: string) => void;
  pauseTask: (id: string) => void;
  resumeTask: (id: string) => void;
  completeTask: (id: string) => void;
  failTask: (id: string, error: string) => void;
  cancelTask: (id: string) => void;
  retryTask: (id: string) => void;

  // Chunk tracking
  updateChunkStatus: (taskId: string, chunkIndex: number, status: ChunkInfo["status"]) => void;
  getUploadedChunkIndices: (taskId: string) => number[];

  // Progress
  updateProgress: (id: string, progress: number, speed?: number) => void;

  // Bulk operations
  clearCompleted: () => void;
  clearFailed: () => void;
  clearAll: () => void;

  // Queue management
  processQueue: () => void;
  recalculateQueuePositions: () => void;
}

// ──────────────────────────── Implementation ────────────────────────────

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [],
  maxConcurrent: MAX_CONCURRENT_TASKS,

  // ──── Getters ────

  getActiveTasks: () => get().tasks.filter((t) => t.status !== "completed" && t.status !== "cancelled"),
  getPendingTasks: () => get().tasks.filter((t) => t.status === "pending"),
  getRunningTasks: () => get().tasks.filter((t) => t.status === "running"),
  getCompletedTasks: () => get().tasks.filter((t) => t.status === "completed"),
  getFailedTasks: () => get().tasks.filter((t) => t.status === "failed"),
  getTaskById: (id) => get().tasks.find((t) => t.id === id),
  getRunningCount: () => get().tasks.filter((t) => t.status === "running").length,
  canStartMore: () => get().tasks.filter((t) => t.status === "running").length < get().maxConcurrent,

  // ──── Task CRUD ────

  addTask: (taskData) => {
    const id = crypto.randomUUID();
    const now = Date.now();
    const pendingCount = get().tasks.filter((t) => t.status === "pending").length;

    const newTask: Task = {
      ...taskData,
      id,
      createdAt: now,
      startedAt: null,
      completedAt: null,
      queuePosition: pendingCount + 1,
      abortController: null,
    };

    set((state) => ({ tasks: [...state.tasks, newTask] }));

    // Try to start if we have capacity
    setTimeout(() => get().processQueue(), 0);

    return id;
  },

  updateTask: (id, updates) => {
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    }));
  },

  removeTask: (id) => {
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
    }));
    get().recalculateQueuePositions();
  },

  // ──── Status Transitions ────

  startTask: (id) => {
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              status: "running" as TaskStatus,
              startedAt: t.startedAt ?? Date.now(),
              abortController: new AbortController(),
            }
          : t
      ),
    }));
  },

  pauseTask: (id) => {
    const task = get().getTaskById(id);
    if (!task || task.status !== "running") return;

    // Abort current operation
    task.abortController?.abort();

    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, status: "paused" as TaskStatus, abortController: null } : t
      ),
    }));

    get().processQueue();
  },

  resumeTask: (id) => {
    const task = get().getTaskById(id);
    if (!task || task.status !== "paused") return;

    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id
          ? { ...t, status: "pending" as TaskStatus, queuePosition: get().getPendingTasks().length + 1 }
          : t
      ),
    }));

    get().processQueue();
  },

  completeTask: (id) => {
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              status: "completed" as TaskStatus,
              progress: 100,
              completedAt: Date.now(),
              speed: 0,
              abortController: null,
            }
          : t
      ),
    }));

    get().processQueue();
  },

  failTask: (id, error) => {
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              status: "failed" as TaskStatus,
              error,
              speed: 0,
              abortController: null,
            }
          : t
      ),
    }));

    get().processQueue();
  },

  cancelTask: (id) => {
    const task = get().getTaskById(id);
    if (!task) return;

    // Abort if running
    task.abortController?.abort();

    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id
          ? { ...t, status: "cancelled" as TaskStatus, abortController: null, speed: 0 }
          : t
      ),
    }));

    get().processQueue();
  },

  retryTask: (id) => {
    const task = get().getTaskById(id);
    if (!task || (task.status !== "failed" && task.status !== "cancelled")) return;

    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              status: "pending" as TaskStatus,
              progress: 0,
              error: null,
              speed: 0,
              queuePosition: get().getPendingTasks().length + 1,
              // Reset chunk statuses for chunked uploads
              ...(t.chunks.length > 0
                ? { chunks: t.chunks.map((c) => (c.status === "done" ? c : { ...c, status: "pending" as const, retries: 0 })) }
                : {}),
            }
          : t
      ),
    }));

    get().processQueue();
  },

  // ──── Chunk Tracking ────

  updateChunkStatus: (taskId, chunkIndex, status) => {
    set((state) => ({
      tasks: state.tasks.map((t) => {
        if (t.id !== taskId) return t;
        const newChunks = t.chunks.map((c) =>
          c.index === chunkIndex ? { ...c, status, retries: status === "failed" ? c.retries + 1 : c.retries } : c
        );
        const uploadedChunks = newChunks.filter((c) => c.status === "done").length;
        const progress = t.totalChunks > 0 ? Math.round((uploadedChunks / t.totalChunks) * 100) : t.progress;
        return { ...t, chunks: newChunks, uploadedChunks, progress };
      }),
    }));
  },

  getUploadedChunkIndices: (taskId) => {
    const task = get().getTaskById(taskId);
    if (!task) return [];
    return task.chunks.filter((c) => c.status === "done").map((c) => c.index);
  },

  // ──── Progress ────

  updateProgress: (id, progress, speed) => {
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id
          ? { ...t, progress: Math.min(progress, 100), ...(speed !== undefined ? { speed } : {}) }
          : t
      ),
    }));
  },

  // ──── Bulk Operations ────

  clearCompleted: () => {
    set((state) => ({
      tasks: state.tasks.filter((t) => t.status !== "completed"),
    }));
    get().recalculateQueuePositions();
  },

  clearFailed: () => {
    set((state) => ({
      tasks: state.tasks.filter((t) => t.status !== "failed"),
    }));
    get().recalculateQueuePositions();
  },

  clearAll: () => {
    // Abort all running tasks first
    get().tasks
      .filter((t) => t.status === "running")
      .forEach((t) => t.abortController?.abort());
    set({ tasks: [] });
  },

  // ──── Queue Management ────

  processQueue: () => {
    const state = get();
    const runningCount = state.getRunningCount();

    if (runningCount >= state.maxConcurrent) return;

    const slotsAvailable = state.maxConcurrent - runningCount;
    const pendingTasks = state.getPendingTasks().slice(0, slotsAvailable);

    if (pendingTasks.length === 0) return;

    // We don't auto-start tasks here; the task initiator is responsible for calling startTask
    // This just signals that slots are available. The chunked-upload utility will poll.
    // However, we update queue positions for pending tasks.
    get().recalculateQueuePositions();
  },

  recalculateQueuePositions: () => {
    set((state) => {
      const pending = state.tasks.filter((t) => t.status === "pending");

      return {
        tasks: state.tasks.map((t) => {
          if (t.status === "pending") {
            const pos = pending.indexOf(t) + 1;
            return { ...t, queuePosition: pos };
          }
          return t;
        }),
      };
    });
  },
}));
