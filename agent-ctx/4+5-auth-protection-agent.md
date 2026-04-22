# Task 4+5: Auth Protection Agent

## Summary
Added authentication protection to all API routes that were missing it, and verified existing routes already had proper auth.

## Changes Made
1. **`/api/files/versions/[id]/route.ts`** — Added `getAuthUser()` + `unauthorizedResponse()` to GET, POST, and PATCH handlers. Added ownership verification (`!isAdmin && file.userId !== userId`) for all three handlers.

2. **`/api/files/properties/[id]/route.ts`** — Added `getAuthUser()` + `unauthorizedResponse()` to GET handler. Added ownership verification.

3. **`/api/files/batch-rename/route.ts`** — Added `getAuthUser()` + `unauthorizedResponse()` to POST handler. Added `userId` filter to the `whereClause` for non-admin users.

## Verified
- 14 existing routes already had proper auth protection
- `/api/share/[token]` correctly remains public (no auth)
- Lint clean
- Dev server running without errors
