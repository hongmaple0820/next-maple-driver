"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { FileSidebar } from "@/components/file-sidebar";
import { FileToolbar } from "@/components/file-toolbar";
import { FileGrid } from "@/components/file-grid";
import { FileList } from "@/components/file-list";
import { UploadZone } from "@/components/upload-zone";
import { FileActions } from "@/components/file-actions";
import { BatchActions } from "@/components/batch-actions";
import { FileStatusBar } from "@/components/file-status-bar";
import { useFileStore } from "@/store/file-store";

export default function CloudDriveApp() {
  const { viewMode, selectedFileIds, detailFile, clearSelection, setDetailFile } = useFileStore();

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
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedFileIds, detailFile, setDetailFile, clearSelection]);

  return (
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
        {/* Toolbar */}
        <FileToolbar />

        {/* File area with upload zone */}
        <UploadZone>
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto">
              {viewMode === "grid" ? <FileGrid /> : <FileList />}
            </div>
            <FileStatusBar />
          </div>
        </UploadZone>
      </div>

      {/* Dialogs */}
      <FileActions />

      {/* Batch actions floating bar */}
      <BatchActions />
    </motion.div>
  );
}
