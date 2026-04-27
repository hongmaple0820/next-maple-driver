# Task 4 - Transfer Station Enhancement Agent

## Task
Enhance transfer station with anonymous support, capacity limits, expired file cleanup, and download tracking

## Work Completed

### 1. Anonymous User Support
- **Upload endpoint** (`/api/transfer/upload/route.ts`): Wrapped `getAuthUser()` in try/catch so it never blocks anonymous users. Anonymous uploads work with `userId=null` and `isAnonymous=true`.
- **QR Upload** (`/api/transfer/qr-upload/[sessionId]/route.ts`): Same anonymous-friendly pattern.

### 2. Capacity Limit Enforcement
- **Per-file limits**: Anonymous 50MB, Authenticated 500MB
- **Expiry limits**: Anonymous 7 days max, Authenticated 30 days max
- **Total storage limits**: Anonymous 500MB total, Authenticated 5GB total
  - Uses Prisma aggregate to sum existing file sizes for the user
  - Returns HTTP 507 (Insufficient Storage) when capacity exceeded
  - Returns detailed error with `usedStorage` and `storageLimit`
- **Structured error codes**: `FILE_TOO_LARGE`, `STORAGE_LIMIT_EXCEEDED`, `EXPIRY_TOO_LONG`, `EXPIRY_REQUIRED`

### 3. Expired Transfer Cleanup
- **New endpoint**: `POST /api/transfer/cleanup`
  - Finds all TransferFile records where `expiresAt < now`
  - Deletes physical files from storage
  - Deletes database records
  - Returns stats: `cleaned`, `filesDeleted`, `filesFailed`, `totalExpired`, `historyCleaned`
  - Also cleans orphaned TransferHistory records
- **Preview endpoint**: `GET /api/transfer/cleanup`
  - Returns expired transfers without deleting (for admin dashboards)
  - Shows count, totalSize, and individual transfer details

### 4. Download Tracking Enhancement
- Download count checked BEFORE incrementing (prevents race conditions)
- Physical file existence verified before incrementing count
- If file missing, DB record cleaned up and returns 404
- Response headers include `X-Download-Count` and `X-Max-Downloads`
- Structured error codes for all failure cases

### 5. Transfer Info Endpoint Enhancement
- Added `isAnonymous` and `remainingDownloads` fields
- DELETE now allows anonymous transfers to be deleted by anyone with the token
- Authenticated transfers still require owner authentication

## Files Modified
- `src/app/api/transfer/upload/route.ts` - Anonymous support + capacity limits
- `src/app/api/transfer/qr-upload/[sessionId]/route.ts` - Same enhancements for QR flow
- `src/app/api/transfer/[token]/download/route.ts` - Download tracking + file existence check
- `src/app/api/transfer/[token]/route.ts` - Enhanced info + flexible delete auth
- `src/app/api/transfer/cleanup/route.ts` - NEW: Expired transfer cleanup

## Lint Status
All transfer API files pass lint. Pre-existing error in `admin-disk-tab.tsx` is unrelated.
