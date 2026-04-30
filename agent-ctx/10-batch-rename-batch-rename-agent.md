# Task 10-batch-rename: Batch Rename Agent

## Summary
Added Batch Rename functionality to the CloudDrive app, allowing users to select multiple files and rename them using a pattern.

## Files Created
- `src/app/api/files/batch-rename/route.ts` — Backend API endpoint for batch renaming
- `src/components/batch-rename-dialog.tsx` — Dialog component with pattern input, preview, and rename execution

## Files Modified
- `src/store/file-store.ts` — Added `batchRenameOpen` and `setBatchRenameOpen` state
- `src/components/batch-actions.tsx` — Added Rename button with Pencil icon
- `src/components/file-grid.tsx` — Added Batch Rename context menu option, Pencil icon import, setBatchRenameOpen
- `src/components/file-list.tsx` — Added Batch Rename context menu option, setBatchRenameOpen
- `src/components/file-actions.tsx` — Added BatchRenameDialog import and component

## Key Implementation Details
- Pattern supports: `{name}`, `{ext}`, `{i}`, `{i:0}`, `{date}`
- Start number and step configurable
- Live preview shows old→new names with color coding
- Backend validates duplicate names and collisions
- Physical files renamed in storage directory
- Context menu option only shows when >1 files selected and not in trash
- Lint clean, no runtime errors
