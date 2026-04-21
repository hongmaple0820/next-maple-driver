# Task 8-file-version - File Version Agent

## Task: Create File Version History API and UI

## Work Completed

### 1. API Route: `src/app/api/files/versions/[id]/route.ts`
- **GET**: List all versions of a file by fileId
  - Queries FileVersion table where fileId = id, ordered by version DESC
  - Returns `{ versions: [...], currentVersion: number }`
  - Each version has: id, name, size, mimeType, version, createdAt
  
- **POST**: Create a new version snapshot
  - Reads current FileItem, gets max version from existing records
  - Copies physical file to versioned path (`{originalPath}.v{versionNumber}`)
  - Creates FileVersion record with crypto.randomUUID() ID
  - Returns new version record with 201 status
  
- **PATCH**: Restore a specific version (body: `{ versionId }`)
  - Finds FileVersion by versionId, validates it belongs to the file
  - Copies versioned file back to current storagePath
  - Updates FileItem's name, size, mimeType to match version
  - Returns updated file in normalized format

### 2. Component: `src/components/file-version-panel.tsx`
- Uses `useQuery` to fetch versions from `/api/files/versions/{fileId}`
- "Save Version" button creates new snapshots (POST)
- Timeline list with version badges, file info, restore buttons
- framer-motion staggered animations
- shadcn/ui components: Button, Badge, ScrollArea
- Empty state, loading skeletons, toast notifications

### 3. Integration: `src/components/file-detail-panel.tsx`
- Added FileVersionPanel below Details section, above Description
- Only visible for files (not folders)
- Motion animation with border separator

## Files Changed
- Created: `src/app/api/files/versions/[id]/route.ts`
- Created: `src/components/file-version-panel.tsx`
- Modified: `src/components/file-detail-panel.tsx`

## Verification
- `bun run lint` passes with no errors
- Dev server running without errors
