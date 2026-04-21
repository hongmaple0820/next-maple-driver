---
Task ID: 1-frontend-fixes
Agent: Frontend Fixes Agent
Task: Fix Frontend Bugs and Add New Features in CloudDrive

Work Log:
- **Bug Fix 1**: Fixed starred view sending `parentId=root` in both `file-grid.tsx` and `file-list.tsx`. When starred, parentId is no longer included in URL params. The params are now built conditionally using `URLSearchParams` with `if (!starred)` check.
- **Feature 1**: Added "Empty Trash" button in `file-toolbar.tsx` with AlertDialog confirmation. Appears only when `section === "trash"`. Calls `DELETE /api/files/trash` and invalidates queries on success.
- **Feature 2**: Added "Recent" section:
  - Updated `Section` type in `file-store.ts` to include `"recent"`
  - Added Clock icon nav item in `file-sidebar.tsx`
  - Added fetch logic for `/api/files/recent` in both `file-grid.tsx` and `file-list.tsx`
  - Added "Recent" label in `sectionLabels` in `file-toolbar.tsx`
  - Added empty state text "No recent files" in `file-grid.tsx`
- **Feature 3**: Added dark mode toggle in sidebar with `next-themes` `useTheme` hook, `Switch` component, and Moon/Sun icons.
- **Feature 4**: Added image thumbnails in grid view `file-card.tsx`. For image file types (jpg, jpeg, png, gif, webp, svg, bmp), shows a 48x48 thumbnail from `/api/files/download?id=...&mode=inline` instead of the generic file type icon.
- **Feature 5**: Created `batch-actions.tsx` with floating action bar for multi-select. Shows count, Star and Trash/Delete buttons. Added `BatchActions` component to `cloud-drive-app.tsx`.
- Backend endpoints `DELETE /api/files/trash` and `GET /api/files/recent` already existed.
- Lint check passed with no errors.
- Dev server running without errors.

Files Modified:
- `/home/z/my-project/src/components/file-grid.tsx` - Bug fix (starred params) + recent fetch + empty state
- `/home/z/my-project/src/components/file-list.tsx` - Bug fix (starred params) + recent fetch
- `/home/z/my-project/src/components/file-toolbar.tsx` - Empty Trash button + Recent label
- `/home/z/my-project/src/store/file-store.ts` - Added "recent" to Section type
- `/home/z/my-project/src/components/file-sidebar.tsx` - Recent nav item + Dark mode toggle
- `/home/z/my-project/src/components/file-card.tsx` - Image thumbnails
- `/home/z/my-project/src/app/cloud-drive-app.tsx` - BatchActions integration

Files Created:
- `/home/z/my-project/src/components/batch-actions.tsx` - Batch operations floating bar

Stage Summary:
- All 5 features and 1 bug fix implemented successfully
- Lint clean, dev server running without errors
