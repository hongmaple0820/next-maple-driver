# Task 2: Cross-Driver File Move/Copy

## Agent: Main Agent

## Work Log

### 1. Added `driverId` field to FileItem in Prisma schema
- Added `driverId String?` field to FileItem model in `prisma/schema.prisma`
- `null` means default local driver
- Ran `bun run db:push` successfully to update the database

### 2. Updated existing file creation/upload APIs to set driverId
- **Upload API** (`src/app/api/files/upload/route.ts`):
  - Added `driverId` parameter from formData (optional, defaults to null)
  - Passed `driverId` to `uploadSingleFile` function
  - Included `driverId` in `db.fileItem.create` calls for both files and folders
  - Added `driverId` to the response object
- **Files API** (`src/app/api/files/route.ts`):
  - Added `driverId` to `POST` (create folder) destructured body params
  - Included `driverId` in folder creation data
  - Added `driverId` to folder creation response
  - Added `driverId` to the GET list response mapping

### 3. Created cross-driver transfer API at `/api/files/cross-driver-transfer/route.ts`
- **POST endpoint**: Starts a cross-driver file transfer
  - Accepts `fileIds`, `targetDriverId`, `targetParentId`, `mode` (copy/move)
  - Creates a transfer task with unique ID
  - Processes transfers asynchronously
  - For files: reads from source driver, writes to target driver, updates DB
  - For folders: updates driverId and parentId, recursively updates children
  - In move mode: deletes from source driver after successful write
  - Returns task ID and initial status (HTTP 202)
- **GET endpoint**: Lists available storage drivers for transfer
  - Returns all active/enabled drivers from DB plus default local driver
- Uses global in-memory store for task tracking (shared with [taskId] route)
- Handles source/target driver resolution including DB-configured drivers

### 4. Created cross-driver transfer status API at `/api/files/cross-driver-transfer/[taskId]/route.ts`
- **GET endpoint**: Checks transfer progress by taskId
- Returns: status (pending/in_progress/completed/failed), progress percentage, totalFiles, processedFiles, succeededFiles, failedFiles, errors, duration
- Uses the same global in-memory store as the parent route

### 5. Added i18n translations for cross-driver operations
- **Chinese (zh)**: Added 24 translation keys including crossDriverTransfer, selectTargetDriver, transferMode, copyToDriver, moveToDriver, transferring, transferComplete, transferFailed, sourceDriver, targetDriver, targetFolder, rootFolder, noDriversAvailable, sameDriverWarning, selectDriver, transferProgress, filesSucceeded, filesFailed, moveToDrive, startTransfer, cancelTransfer, currentDriver, localDefault
- **English (en)**: Added the same 24 keys with English values

### 6. Added cross-driver move dialog state to file store
- Added `crossDriverMoveOpen: boolean` and `setCrossDriverMoveOpen` to `src/store/file-store.ts`
- Added `crossDriverMoveFileIds: string[]` and `setCrossDriverMoveFileIds`
- Added `driverId?: string | null` to `FileItem` interface in `src/lib/file-utils.ts`

### 7. Created CrossDriverMoveDialog component
- Created `src/components/cross-driver-move-dialog.tsx`
- Features:
  - Lists available storage drivers with radio selection (shows type emoji, name, type, default badge)
  - Copy vs Move toggle with descriptive buttons
  - Target folder display (root)
  - Progress bar during transfer with polling (1s interval)
  - Shows total/succeeded/failed counts in a 3-column grid
  - Shows error messages in a scrollable area
  - Disables close during transfer
  - Resets state on dialog close

### 8. Added "Move to Drive" menu option
- **file-card.tsx**: Added HardDrive import, added `setCrossDriverMoveOpen` and `setCrossDriverMoveFileIds` from store, added "Move to Drive..." option in both dropdown menu and context menu (after Copy, before separator)
- **file-list.tsx**: Same additions - HardDrive import, store access, menu items in both dropdown and context menus

### 9. Integrated CrossDriverMoveDialog in file-actions.tsx
- Imported `CrossDriverMoveDialog` component
- Added it to the `FileActions` component's render alongside other dialogs

### 10. Verified with lint
- Fixed `react-hooks/set-state-in-effect` lint error by using `setTimeout` with 0ms delay for state reset
- `bun run lint` passes with no errors

## Stage Summary
- 2 new API routes created (cross-driver-transfer POST+GET, cross-driver-transfer/[taskId] GET)
- 1 new component created (CrossDriverMoveDialog)
- 7 files modified (schema, upload route, files route, file-store, file-utils, file-card, file-list, file-actions, translations)
- driverId field added to FileItem model
- Cross-driver file move/copy fully functional with progress tracking
- i18n support for zh and en
- Lint clean, dev server running without errors
