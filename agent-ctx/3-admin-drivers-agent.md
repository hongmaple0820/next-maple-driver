# Task 3 - Admin Drivers Management UI

## Task ID
3

## Agent
Admin Drivers Agent

## Summary
Built a complete Admin Drivers Management UI with 3-step wizard, edit dialog, enhanced driver cards, OAuth integration, and sidebar storage usage bars.

## Files Modified

### 1. `/home/z/my-project/src/components/admin/admin-drivers-tab.tsx` (Complete Rewrite)
- **3-Step Add Driver Dialog**: Step 1 = Select Type (categorized grid), Step 2 = Configure (dynamic form fields), Step 3 = Test & Save
- **Driver Type Categories**: 本地存储 (Local), 云盘驱动 (Cloud), 协议驱动 (Protocol), 网络挂载 (Network)
- **Color-coded Type Badges**: local=slate, webdav=blue, s3=amber, ftp=green, baidu=blue, aliyun=orange, onedrive=sky, google=red, 115=purple, quark=cyan
- **Enhanced Driver Cards**: Grid layout (2 columns on sm+), icon + type badge, status indicator (colored dot), mount path, storage usage bar, last sync time
- **Status Indicators**: Green for active, Yellow for inactive, Red for error, Gray for unknown
- **Quick Actions per Driver**: Health Check, Edit, Toggle Enable/Disable, Authorize (for OAuth), Delete
- **Edit Driver Dialog**: Pre-filled form with all fields, OAuth re-authorize button, token status display
- **Delete Confirmation**: AlertDialog with warning about inaccessible files
- **OAuth Flow**: Opens popup window, polls for closure, refreshes driver list on completion
- **Available Driver Types Grid**: Shows all 11 driver types with Active/Available status and auth type badges
- **Chinese labels**: 百度网盘, 阿里云盘, 115网盘, 夸克网盘, 本地磁盘, 网络挂载, etc.

### 2. `/home/z/my-project/src/app/api/admin/drivers/[id]/route.ts` (Bug Fix + Enhancement)
- **Fixed**: `invalidateMountCache()` was unreachable (after `return` statement) — moved before return
- **Enhanced**: Added support for `accessToken`, `refreshToken`, `tokenExpiresAt` in PUT handler
- **Enhanced**: Mask tokens in response (show '••••••••' instead of actual values)

### 3. `/home/z/my-project/src/components/file-sidebar.tsx` (Enhancement)
- **Added**: Storage stats query in DriverStatusSection
- **Added**: Storage usage bar in expanded driver info (shows used/total with color-coded progress)
- **Enhanced**: Driver type display names now use Chinese labels (driverDisplayNames)

## Key Implementation Details

### 3-Step Wizard Flow
1. **Select Type**: User sees 4 categories with clickable cards. Each card shows icon, Chinese name, English name, description, and auth type indicator
2. **Configure**: Dynamic form based on selected type. OAuth drivers show blue notice, password drivers show violet notice, mount drivers show protocol selector
3. **Test & Save**: Shows driver summary, test connection button with loading spinner, result display (success/failure), and save button

### Driver Type Colors
```
local: slate     webdav: blue     s3: amber     ftp: green
baidu: blue      aliyun: orange   onedrive: sky google: red
115: purple      quark: cyan      mount: emerald
```

### OAuth Integration
- Clicking "Authorize" opens popup window via `window.open()`
- Polls popup closure with `setInterval(500)`
- On popup close, refreshes driver list from API
- 5-minute timeout for safety
- "Re-authorize" button shown when token is expired

### Edit Dialog
- Pre-fills all fields from existing driver config
- Shows OAuth status with token expiry info
- Supports re-authorization for OAuth drivers
- Dynamic config fields based on driver type

## Lint Status
✅ Clean - no errors
