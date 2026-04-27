# Task 7a - Chunked Upload Integration Agent

## Summary
Integrated the chunked upload system into the actual upload flow and enhanced the upload experience.

## Changes Made

### 1. upload-utils.ts
- **MAX_FILE_SIZE**: Changed from 100MB to 500MB
- **CHUNKED_UPLOAD_THRESHOLD**: Added 5MB constant for auto-routing
- **uploadFileWithProgress**: 
  - Files >= 5MB automatically use `initiateChunkedUpload` from chunked-upload.ts
  - Files < 5MB use existing XHR but now also create task entries in task store
  - Task entries track progress, speed, and status (completed/failed)
  - Backward compatibility maintained with file-store's `uploadProgress` entries
- **validateFileSize**: Error message updated to reflect 500MB limit

### 2. file-toolbar.tsx
- Added "Up to 500 MB per file" visual indicator below Upload and Upload Folder buttons
- Wrapped buttons in flex-col container for clean layout with hint text
- Upload and Upload Folder buttons already supported multiple file selection and webkitdirectory

### 3. upload-zone.tsx
- Added `traverseEntry()` for recursive FileSystemEntry traversal
- Added `extractFilesFromDataTransfer()` using `webkitGetAsEntry` for folder support
- Added `isFolderDrag` state to detect folder drags
- Drag overlay shows "Drop folder to upload" when folder detected
- `uploadFolderFiles()` handles folder uploads with path preservation
- Large files in folders (>=5MB) use chunked upload; small files use batch XHR
- Storage hint now shows "Max 500.0 MB per file"

## Lint Status
✅ Clean - no errors
