"use client";

import { FileSidebar } from "@/components/file-sidebar";
import { FileToolbar } from "@/components/file-toolbar";
import { FileGrid } from "@/components/file-grid";
import { FileList } from "@/components/file-list";
import { UploadZone } from "@/components/upload-zone";
import { FileActions } from "@/components/file-actions";
import { useFileStore } from "@/store/file-store";

export default function CloudDriveApp() {
  const { viewMode } = useFileStore();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <FileSidebar />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <FileToolbar />

        {/* File area with upload zone */}
        <UploadZone>
          <div className="flex-1 overflow-y-auto">
            {viewMode === "grid" ? <FileGrid /> : <FileList />}
          </div>
        </UploadZone>
      </div>

      {/* Dialogs */}
      <FileActions />
    </div>
  );
}
