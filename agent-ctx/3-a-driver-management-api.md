# Task 3-a: Driver Management API Routes - Work Log

## Summary
Created and improved 7 API routes for driver management, covering CRUD operations, authentication flows, health checks, and driver type discovery.

## Files Created

### 1. `/api/drivers/route.ts` - User Drivers API
- **GET**: List all storage drivers for the current user with masked tokens (accessToken/refreshToken show as "••••••••")
- **POST**: Create a new driver for the current user. Accepts: name, type, config (object with driver-specific fields), mountPath. Auto-sets authType from the factory. Validates driver type and required config fields.

### 2. `/api/drivers/[id]/route.ts` - User Driver Detail API
- **GET**: Get single driver details with masked tokens
- **PUT**: Update driver config (name, status, priority, basePath, config, mountPath, isReadOnly, isEnabled). Invalidates driver instance cache and VFS mount cache.
- **DELETE**: Delete a driver (prevents deleting default driver). Invalidates driver instance cache and VFS mount cache.

### 3. `/api/drivers/[id]/authorize/route.ts` - Driver Auth API
- **POST**: Initiate authorization for a driver
  - For OAuth drivers (baidu, aliyun, onedrive, google): Generates authorization URL with CSRF state, returns URL for frontend redirect
  - For non-OAuth drivers (quark, 115): Accepts credentials (phone+password/SMS, or account+password), performs login via driver.login(), saves cookies/tokens to DB config
- **DELETE**: De-authorize a driver (clears tokens, cookies from config, sets authStatus to "pending")

### 4. `/api/drivers/[id]/sms-code/route.ts` - SMS Code Request
- **POST**: Request SMS verification code for Quark driver. Accepts phone number, calls QuarkDriver.requestSmsCode() method. Updates phone in driver config.

### 5. `/api/drivers/[id]/health/route.ts` - Driver Health Check
- **GET**: Run health check on a specific driver. Uses driver.healthCheck() for cloud drivers, existsSync for local/mount drivers. Updates authStatus and status in DB based on result.

### 6. `/api/drivers/types/route.ts` - Available Driver Types
- **GET**: Return all available driver types with their factory info (displayName, description, authType, configFields). Used by frontend to show available driver types.

## Files Updated

### 7. `/api/auth/cloud-oauth/callback/route.ts` - OAuth Callback
- Updated to use proper StorageDriverConfig type instead of inline type casting
- Added invalidateDriver() and invalidateMountCache() calls after token exchange
- Added lastSyncAt update on successful authorization
- Added redirectUri auto-detection from request URL

## Key Design Decisions
- All routes require authentication (session check via getServerSession + authOptions)
- Sensitive tokens are always masked in API responses (accessToken, refreshToken show as "••••••••")
- Driver instance cache and VFS mount cache are invalidated after any driver change
- Non-OAuth login flow: credentials → driver.login() → save cookies to DB config → set authStatus to "authorized"
- OAuth flow: POST /authorize → get authorizationUrl → redirect user → callback exchanges code → save tokens
- Health check updates DB authStatus based on result (healthy→authorized, expired→expired, needs login→pending, error→error)
- SMS code is a separate step: user requests code first, then uses it in the authorize endpoint

## Lint Status
- All files pass `bun run lint` with no errors
- Dev server running without issues
