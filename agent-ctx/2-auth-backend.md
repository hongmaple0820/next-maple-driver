# Task 2 - Auth System Backend Agent

## Task
Add complete auth system to CloudDrive: User model, NextAuth.js v4, register API, seed script, AuthProvider.

## Work Done

### Step 1: Updated Prisma Schema
- Added `User` model with fields: id, email, name, passwordHash, role, avatarUrl, storageLimit, createdAt, updatedAt
- Added `userId` (String?) and `user` (User?) relation to `FileItem` model with onDelete: Cascade
- Added `userId` (String?) and `user` (User?) relation to `ShareLink` model with onDelete: SetNull
- Added indexes on userId for both models
- Changed `storageLimit` from `Int` to `BigInt` to support 10GB value (10737418240 exceeds 32-bit int max)

### Step 2: Pushed Schema Changes
- Ran `bun run db:push` to apply schema changes
- Had to use `--accept-data-loss` flag for Int→BigInt column change

### Step 3: Installed bcryptjs
- `bun add bcryptjs` (v3.0.3 with native binaries)
- `bun add -d @types/bcryptjs` (v3.0.0)

### Step 4: Created `/src/lib/auth.ts`
- NextAuth.js v4 configuration with CredentialsProvider
- JWT session strategy
- Custom jwt/session callbacks to include user id and role in token/session
- Custom signIn page at "/login"
- Secret from env or fallback

### Step 5: Created `/src/app/api/auth/[...nextauth]/route.ts`
- NextAuth handler exporting GET and POST

### Step 6: Created `/src/lib/auth-helpers.ts`
- `getAuthUser()` - returns session user or null
- `requireAuth()` - returns session user or null
- `unauthorizedResponse()` - returns 401 JSON response

### Step 7: Created `/src/app/api/auth/register/route.ts`
- POST endpoint for user registration
- Validates email, password (min 6 chars), name
- Checks for duplicate emails (409)
- Hashes password with bcrypt (salt rounds: 12)
- Creates user with role "user"

### Step 8: Created and Ran Seed Script
- Created `/prisma/seed.ts` with admin and demo users
- Admin: admin@clouddrive.com / admin123 (role: admin)
- Demo: demo@clouddrive.com / demo123 (role: user)
- Both users created successfully with 10GB storage limit

### Step 9: Updated `.env`
- Added NEXTAUTH_URL=http://localhost:3000
- Added NEXTAUTH_SECRET=clouddrive-dev-secret-key-2024

### Step 10: Created `/src/components/auth-provider.tsx`
- Client component wrapping SessionProvider from next-auth/react

### Step 11: Updated `/src/app/layout.tsx`
- Added AuthProvider import
- Wrapped children with AuthProvider inside ThemeProvider

## Testing Results
- ✅ Register API: Creates new users, rejects duplicates, validates input
- ✅ NextAuth sign-in: Admin and Demo users can authenticate successfully
- ✅ Session API: Returns user info with id, name, email, role
- ✅ Dev server running without errors

## Files Created
- `/src/lib/auth.ts`
- `/src/lib/auth-helpers.ts`
- `/src/app/api/auth/[...nextauth]/route.ts`
- `/src/app/api/auth/register/route.ts`
- `/src/components/auth-provider.tsx`
- `/prisma/seed.ts`

## Files Modified
- `/prisma/schema.prisma` - Added User model, userId fields on FileItem/ShareLink, BigInt storageLimit
- `/.env` - Added NEXTAUTH_URL, NEXTAUTH_SECRET
- `/src/app/layout.tsx` - Added AuthProvider wrapper

## Notes
- Pre-existing lint error in upload-progress-overlay.tsx (not related to this task)
- Had to clear .next cache and restart dev server to pick up Prisma Client changes with User model
