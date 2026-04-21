"use client";

import { CreateFolderDialog } from "@/components/create-folder-dialog";
import { RenameDialog } from "@/components/rename-dialog";
import { MoveDialog } from "@/components/move-dialog";
import { ShareDialog } from "@/components/share-dialog";
import { FilePreview } from "@/components/file-preview";
import { FileDetailPanel } from "@/components/file-detail-panel";
import { FilePropertiesDialog } from "@/components/file-properties-dialog";
import { BatchRenameDialog } from "@/components/batch-rename-dialog";

export function FileActions() {
  return (
    <>
      <CreateFolderDialog />
      <RenameDialog />
      <MoveDialog />
      <ShareDialog />
      <FilePreview />
      <FileDetailPanel />
      <FilePropertiesDialog />
      <BatchRenameDialog />
    </>
  );
}
