import { toast } from "sonner";
import type { QueryClient } from "@tanstack/react-query";

/**
 * Show an undo toast notification for file operations.
 * This is the Google Drive-style pattern: show a toast with an "Undo" button
 * that reverses the action within a time window.
 *
 * @param description - Description of the action performed
 * @param undoCallback - Async function to call when Undo is clicked
 * @param options - Optional configuration
 */
export function showUndoToast(
  description: string,
  undoCallback: () => Promise<void>,
  options?: {
    duration?: number;
    onSuccess?: string;
  },
) {
  const duration = options?.duration ?? 5000;
  const successMessage = options?.onSuccess ?? "Action undone";

  toast(description, {
    duration,
    action: {
      label: "Undo",
      onClick: async () => {
        try {
          await undoCallback();
          toast.success(successMessage);
        } catch {
          toast.error("Failed to undo action");
        }
      },
    },
  });
}

/**
 * Show a notification toast with an action button.
 * Used for non-undoable actions like share link creation, upload summaries, etc.
 */
export function showActionToast(
  description: string,
  actionLabel: string,
  actionCallback: () => void | Promise<void>,
  options?: {
    duration?: number;
    variant?: "success" | "info" | "warning";
  },
) {
  const duration = options?.duration ?? 5000;
  const variant = options?.variant ?? "success";

  const toastFn = variant === "warning" ? toast.warning : variant === "info" ? toast.info : toast.success;

  toastFn(description, {
    duration,
    action: {
      label: actionLabel,
      onClick: async () => {
        await actionCallback();
      },
    },
  });
}

/**
 * Helper to invalidate relevant query caches after an undo operation.
 */
export function invalidateAfterUndo(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ["files"] });
  queryClient.invalidateQueries({ queryKey: ["storage-stats"] });
}
