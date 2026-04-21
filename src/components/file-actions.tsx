"use client";

import { CreateFolderDialog } from "@/components/create-folder-dialog";
import { RenameDialog } from "@/components/rename-dialog";
import { MoveDialog } from "@/components/move-dialog";
import { ShareDialog } from "@/components/share-dialog";
import { FilePreview } from "@/components/file-preview";
import { FileDetailPanel } from "@/components/file-detail-panel";

export function FileActions() {
  return (
    <>
      <CreateFolderDialog />
      <RenameDialog />
      <MoveDialog />
      <ShareDialog />
      <FilePreview />
      <FileDetailPanel />
    </>
  );
}
