# Task 1-backend-fixes — Backend Fix Agent

## Summary
Fixed 5 backend API bugs in the CloudDrive application. All changes pass lint check and dev server runs without errors.

## Changes Made

### Bug 1: Starred view filters by parentId=root
- **File**: `src/app/api/files/route.ts`
- **Fix**: When `starred=true`, the API now ignores `parentId` and queries ALL starred files regardless of folder. Previously, starred items in subfolders were hidden because the query filtered by `parentId`.

### Bug 2: Search API returns parentId=null instead of "root"
- **File**: `src/app/api/files/search/route.ts`
- **Fix**: Changed `parentId: file.parentId` to `parentId: file.parentId ?? 'root'` so top-level items return `"root"` consistently.

### Bug 3a: Star API response not normalized
- **File**: `src/app/api/files/star/route.ts`
- **Fix**: Changed response from `{ file: { ...rawPrisma } }` to flat normalized format with `starred`/`trashed` booleans, `parentId ?? 'root'`, and ISO date strings.

### Bug 3b: Restore API response not normalized
- **File**: `src/app/api/files/restore/route.ts`
- **Fix**: Same normalization as star API — flat format instead of `{ file: ... }`.

### Bug 4: Add "Empty Trash" endpoint
- **File**: `src/app/api/files/trash/route.ts` (new)
- **Endpoint**: `DELETE /api/files/trash`
- **Behavior**: Permanently deletes all trashed items recursively, including file system cleanup.

### Bug 5: Add "Recent Files" endpoint
- **File**: `src/app/api/files/recent/route.ts` (new)
- **Endpoint**: `GET /api/files/recent`
- **Behavior**: Returns 10 most recently modified non-trashed files in normalized format.

## Verification
- `bun run lint` passes with no errors
- Dev server running without errors
