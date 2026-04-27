"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileSidebar } from "@/components/file-sidebar";
import { FileToolbar } from "@/components/file-toolbar";
import { FileGrid } from "@/components/file-grid";
import { FileList } from "@/components/file-list";
import { UploadZone } from "@/components/upload-zone";
import { FileActions } from "@/components/file-actions";
import { BatchActions } from "@/components/batch-actions";
import { BatchMoveDialog, BatchCopyDialog } from "@/components/batch-move-copy-dialog";
import { FileStatusBar } from "@/components/file-status-bar";
import { KeyboardShortcutsDialog } from "@/components/keyboard-shortcuts-dialog";
import { UserPreferencesDialog } from "@/components/user-preferences-dialog";
import { AdminPanel } from "@/components/admin-panel";
import { UploadProgressOverlay } from "@/components/upload-progress-overlay";
import { MyDrivesPanel } from "@/components/my-drives-panel";
import { TaskManagerPanel } from "@/components/task-manager-panel";
import { TransferPanel } from "@/components/transfer-panel";
import { QuickTransferPanel } from "@/components/quick-transfer-panel";
import { TransferStationPanel } from "@/components/transfer-station-panel";
import { ErrorBoundary } from "@/components/error-boundary";
import { useFileStore, type Section } from "@/store/file-store";
import { useUserPreferences } from "@/lib/user-preferences";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { type StorageStats } from "@/lib/file-utils";
import { HardDrive } from "lucide-react";

// Section transition variants
const sectionVariants: Record<string, { initial: Record<string, number>; animate: Record<string, number>; exit: Record<string, number> }> = {
  "files-starred": {
    initial: { x: 60, opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: { x: -60, opacity: 0 },
  },
  "starred-files": {
    initial: { x: -60, opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: { x: 60, opacity: 0 },
  },
  "files-trash": {
    initial: { y: 40, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit: { y: -40, opacity: 0 },
  },
  "trash-files": {
    initial: { y: -40, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit: { y: 40, opacity: 0 },
  },
  "files-quick-transfer": {
    initial: { scale: 0.95, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
    exit: { scale: 1.05, opacity: 0 },
  },
  "quick-transfer-files": {
    initial: { scale: 1.05, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
    exit: { scale: 0.95, opacity: 0 },
  },
  "files-recent": {
    initial: { x: 30, opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: { x: -30, opacity: 0 },
  },
  "recent-files": {
    initial: { x: -30, opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: { x: 30, opacity: 0 },
  },
  "files-transfer-station": {
    initial: { x: 60, opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: { x: -60, opacity: 0 },
  },
  "transfer-station-files": {
    initial: { x: -60, opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: { x: 60, opacity: 0 },
  },
  default: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
};

function getTransitionVariant(from: Section, to: Section) {
  const key = `${from}-${to}`;
  return sectionVariants[key] || sectionVariants.default;
}

export default function CloudDriveApp() {
  const {
    viewMode, selectedFileIds, detailFile, clearSelection, setDetailFile,
    setShortcutsOpen, setClipboard, currentFolderId, section,
    preferencesOpen, setPreferencesOpen,
    setViewMode, setSortBy, setSortDirection, setCompactMode, setShowExtensions,
    navigateBack, navigateForward, setCurrentFolderId,
  } = useFileStore();

  // Track previous section for transition direction
  const [prevSection, setPrevSection] = useState<Section>(section);
  const prevFolderRef = useRef(currentFolderId);

  // Update prevSection when section changes
  useEffect(() => {
    setPrevSection(section);
  }, [section]);

  const prefs = useUserPreferences();

  // Apply saved preferences on mount
  const preferencesApplied = useRef(false);
  useEffect(() => {
    if (preferencesApplied.current) return;
    preferencesApplied.current = true;

    setViewMode(prefs.defaultViewMode);
    setSortBy(prefs.defaultSortField);
    setSortDirection(prefs.defaultSortDirection);
    setCompactMode(prefs.compactMode);
    setShowExtensions(prefs.showExtensions);
  }, [prefs.defaultViewMode, prefs.defaultSortField, prefs.defaultSortDirection, prefs.compactMode, prefs.showExtensions, setViewMode, setSortBy, setSortDirection, setCompactMode, setShowExtensions]);

  // Storage usage alert
  const storageAlertShown80 = useRef(false);
  const storageAlertShown90 = useRef(false);

  // Reuse the storage-stats query already set up by FileSidebar.
  // Both components share the same QueryClient, so TanStack Query
  // deduplicates the fetches.  We set a longer refetchInterval here
  // because the sidebar already refreshes every 30 s — the alert
  // logic only needs a periodic re-check.
  const { data: stats } = useQuery<StorageStats>({
    queryKey: ["storage-stats"],
    queryFn: async () => {
      const res = await fetch("/api/files/stats");
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    refetchInterval: 30000,
  });

  // Check storage usage and show alerts
  useEffect(() => {
    if (!stats) return;

    const usedBytes = stats.usedBytes ?? 0;
    const totalBytes = stats.totalBytes ?? 10737418240;
    const usagePercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;

    if (usagePercent >= 90 && !storageAlertShown90.current) {
      storageAlertShown90.current = true;
      storageAlertShown80.current = true; // Also mark 80% as shown
      toast.error("Storage critically full!", {
        description: `${usagePercent.toFixed(0)}% used — Consider deleting files to free up space.`,
        duration: 10000,
        icon: <HardDrive className="w-4 h-4" />,
        action: {
          label: "Manage Storage",
          onClick: () => {
            // Scroll to storage section by clicking on the sidebar storage area
            const storageSection = document.querySelector("[data-storage-section]");
            if (storageSection) {
              storageSection.scrollIntoView({ behavior: "smooth" });
              storageSection.classList.add("ring-2", "ring-emerald-500", "ring-offset-2");
              setTimeout(() => {
                storageSection.classList.remove("ring-2", "ring-emerald-500", "ring-offset-2");
              }, 3000);
            }
          },
        },
      });
    } else if (usagePercent >= 80 && usagePercent < 90 && !storageAlertShown80.current) {
      storageAlertShown80.current = true;
      toast.warning("Storage almost full!", {
        description: `${usagePercent.toFixed(0)}% used — You're running low on storage space.`,
        duration: 8000,
        icon: <HardDrive className="w-4 h-4" />,
        action: {
          label: "Manage Storage",
          onClick: () => {
            const storageSection = document.querySelector("[data-storage-section]");
            if (storageSection) {
              storageSection.scrollIntoView({ behavior: "smooth" });
              storageSection.classList.add("ring-2", "ring-emerald-500", "ring-offset-2");
              setTimeout(() => {
                storageSection.classList.remove("ring-2", "ring-emerald-500", "ring-offset-2");
              }, 3000);
            }
          },
        },
      });
    }

    // Reset alerts if usage drops below thresholds
    if (usagePercent < 80) {
      storageAlertShown80.current = false;
      storageAlertShown90.current = false;
    } else if (usagePercent < 90) {
      storageAlertShown90.current = false;
    }
  }, [stats]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      // Don't trigger when dialogs are open
      if (target.closest('[role="dialog"]')) return;

      // Ctrl+A / Cmd+A - Select all files
      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("clouddrive:select-all"));
      }

      // Delete / Backspace - Move to trash (or permanent delete in trash)
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("clouddrive:delete-selected"));
      }

      // F2 - Rename
      if (e.key === "F2") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("clouddrive:rename-selected"));
      }

      // Escape - Clear selection / close detail panel
      if (e.key === "Escape") {
        if (detailFile) {
          setDetailFile(null);
        } else if (selectedFileIds.size > 0) {
          clearSelection();
        }
      }

      // Enter - Open/Preview
      if (e.key === "Enter") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("clouddrive:open-selected"));
      }

      // Ctrl+C / Cmd+C - Copy
      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        if (selectedFileIds.size > 0) {
          e.preventDefault();
          setClipboard({ fileIds: Array.from(selectedFileIds), operation: "copy" });
          toast.success(`Copied ${selectedFileIds.size} item${selectedFileIds.size > 1 ? "s" : ""}`);
        }
      }

      // Ctrl+X / Cmd+X - Cut
      if ((e.ctrlKey || e.metaKey) && e.key === "x") {
        if (selectedFileIds.size > 0) {
          e.preventDefault();
          setClipboard({ fileIds: Array.from(selectedFileIds), operation: "cut" });
          toast.success(`Cut ${selectedFileIds.size} item${selectedFileIds.size > 1 ? "s" : ""}`);
        }
      }

      // Ctrl+V / Cmd+V - Paste
      if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("clouddrive:paste"));
      }

      // ? (Shift+/) - Show shortcuts dialog
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setShortcutsOpen(true);
      }

      // Ctrl+, / Cmd+, - Open preferences
      if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        setPreferencesOpen(true);
      }

      // Alt+Left - Navigate back
      if (e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        navigateBack();
      }

      // Alt+Right - Navigate forward
      if (e.altKey && e.key === "ArrowRight") {
        e.preventDefault();
        navigateForward();
      }

      // Alt+Home - Navigate to root
      if (e.altKey && e.key === "Home") {
        e.preventDefault();
        setCurrentFolderId("root");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedFileIds, detailFile, setDetailFile, clearSelection, setShortcutsOpen, setClipboard, setPreferencesOpen, currentFolderId, navigateBack, navigateForward, setCurrentFolderId]);

  return (
    <ErrorBoundary>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="flex h-screen overflow-hidden bg-background"
      >
        {/* Sidebar */}
        <FileSidebar />

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Toolbar - hide for transfer sections */}
          {section !== "quick-transfer" && section !== "transfer-station" && <FileToolbar />}

          {/* Quick Transfer Panel */}
          {section === "quick-transfer" ? (
            <AnimatePresence mode="wait">
              <motion.div
                key="quick-transfer"
                {...getTransitionVariant(prevSection, section)}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="flex-1 min-h-0"
              >
                <QuickTransferPanel />
              </motion.div>
            </AnimatePresence>
          ) : section === "transfer-station" ? (
            <AnimatePresence mode="wait">
              <motion.div
                key="transfer-station"
                {...getTransitionVariant(prevSection, section)}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="flex-1 min-h-0"
              >
                <TransferStationPanel />
              </motion.div>
            </AnimatePresence>
          ) : (
            /* File area with upload zone */
            <UploadZone>
              <div className="flex-1 flex flex-col min-h-0">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${section}-${currentFolderId}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2, ease: "easeInOut" }}
                    className="flex-1 overflow-y-auto"
                  >
                    {viewMode === "grid" ? <FileGrid /> : <FileList />}
                  </motion.div>
                </AnimatePresence>
                <FileStatusBar />
              </div>
            </UploadZone>
          )}
        </div>

        {/* Dialogs */}
        <FileActions />

        {/* Batch actions floating bar */}
        <BatchActions />

        {/* Batch move/copy dialogs */}
        <BatchMoveDialog />
        <BatchCopyDialog />

        {/* Keyboard shortcuts dialog */}
        <KeyboardShortcutsDialog />

        {/* User preferences dialog */}
        <UserPreferencesDialog open={preferencesOpen} onOpenChange={setPreferencesOpen} />

        {/* Upload progress floating panel */}
        <UploadProgressOverlay />

        {/* Task Manager floating panel */}
        <TaskManagerPanel />

        {/* Admin Panel */}
        <AdminPanel />

        {/* My Drives Panel */}
        <MyDrivesPanel />
      </motion.div>
    </ErrorBoundary>
  );
}
