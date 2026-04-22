# Task 11: PDF Viewer & Upload Limit

## Agent: PDF Viewer & Upload Limit Agent

## Summary
Added PDF viewer enhancements and upload file size limit indicators to CloudDrive.

## Changes Made

### 1. PDF Viewer (file-preview.tsx)
- Added `border-none` to iframe className for clean rendering
- Added fallback content inside `<iframe>` tag for browsers that don't support embedded PDF viewing
- Fallback shows file type icon, "Your browser does not support embedded PDF viewing" message, and a "Download PDF to view" button

### 2. Text Preview Enhancement (text-preview-content.tsx)
- Added line numbers column on the left side with proper styling
- Line numbers are right-aligned, non-selectable, with muted foreground color
- Added useMemo for line splitting to optimize performance
- Improved overall layout with border separator between line numbers and content

### 3. Upload Size Limits (upload-utils.ts)
- Added `MAX_FILE_SIZE = 100 * 1024 * 1024` (100MB) constant
- Added `MAX_TOTAL_STORAGE = 10 * 1024 * 1024 * 1024` (10GB) constant
- Added `validateFileSize(file: File): { valid: boolean; message?: string }` function
- Integrated validation into `uploadFileWithProgress()` — checks before upload starts, rejects with toast error if too large
- Integrated validation into `uploadFilesWithProgress()` — pre-filters oversized files with error toasts before uploading valid ones

### 4. Upload Limit Hint (file-toolbar.tsx)
- Added "Max 100MB" text next to the Upload button using `text-xs text-muted-foreground hidden sm:inline`

### 5. Remaining Storage in Upload Zone (upload-zone.tsx)
- Added useQuery to fetch storage stats from /api/files/stats
- Shows "X GB available · Max 100.0 MB per file" at bottom of the drop zone (always visible when stats loaded)
- Shows "Max 100.0 MB per file · X GB available" in the drag overlay when dragging files
- Removed unused `Upload` import

## Files Modified
- `src/components/file-preview.tsx`
- `src/components/text-preview-content.tsx`
- `src/lib/upload-utils.ts`
- `src/components/file-toolbar.tsx`
- `src/components/upload-zone.tsx`

## Lint Status
✅ Clean — no errors
