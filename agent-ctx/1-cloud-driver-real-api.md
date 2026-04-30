# Task 1 - Cloud Driver Real API Implementation

## Agent: Cloud Driver Implementation Agent

## Task
Fix the CloudDriverBase to use real HTTP fetch calls instead of mock responses, and implement ALL 6 cloud drivers with real API calls.

## Work Log

### 1. CloudDriverBase (`cloud-driver-base.ts`)
- Replaced mock `exchangeCodeForToken` with real HTTP fetch to OAuth token endpoint
  - Uses `URLSearchParams` for `application/x-www-form-urlencoded` body
  - Supports `extraTokenParams` from OAuth config
  - Updates `accessToken`, `refreshToken`, and `tokenExpiresAt` from response
  - Throws descriptive errors on failure
- Replaced mock `refreshAccessToken` with real HTTP fetch
  - Uses `grant_type=refresh_token` parameter
  - Falls back to existing refresh token if not returned
- Added `apiRequest` helper method
  - Automatically adds `Authorization: Bearer {token}` header
  - Adds `Content-Type: application/json` by default
  - Auto-refreshes token on 401 responses
  - Returns raw Response for caller to handle
- Changed stub methods from returning mock values to throwing "not implemented" errors
- Added `cookieRequest` helper to `CookieAuthDriver`
  - Sets `Cookie` header from stored cookies
  - Adds `User-Agent` header for browser-like requests
  - Auto-re-logins on 401/403 responses

### 2. BaiduDriver (`baidu-driver.ts`)
- `listDir`: Calls `GET /rest/2.0/xpan/file?method=list&dir={path}` with pagination
- `writeFile`: Two-path upload:
  - Small files (<256KB): Single upload via `POST /rest/2.0/pcs/file?method=upload`
  - Large files: Precreate → upload blocks → merge via `superfile2` API
- `readFile`: Gets download link via `GET /rest/2.0/xpan/multimedia?method=dlink`, then downloads
- `deleteFile/deleteDir`: Calls `POST /rest/2.0/xpan/file?method=filemanager&opera=delete`
- `createDir`: Calls `POST /rest/2.0/xpan/file?method=create` with `isdir=1`
- `getStorageInfo`: Calls `GET /pan.baidu.com/api/quota` for used/total storage
- Added `normalizePath` to handle Baidu's `/apps/{appDir}/` prefix
- Added `appDir` config field for custom app directory
- Added SHA-256 block hash calculation for large file uploads

### 3. AliyunDriver (`aliyun-driver.ts`)
- `listDir`: Calls `POST /adrive/v1.0/openFile/list` with drive_id and parent_file_id, supports pagination
- `writeFile`: Three-phase upload: precreate → upload parts via PUT URLs → complete
- `readFile`: Gets download URL via `POST /adrive/v1.0/openFile/getDownloadUrl`, then downloads
- `deleteFile/deleteDir`: Moves to recycle bin via `POST /adrive/v1.0/openFile/recyclebin/trash`
- `createDir`: Calls `POST /adrive/v1.0/openFile/create` with type="folder"
- `getStorageInfo`: Calls `POST /adrive/v1.0/user/getDriveInfo`
- Implemented file_id based system with `resolvePathToFileId` method
- Caches drive_id after first fetch via `getDriveId` method
- Path-to-fileId cache for efficient traversal

### 4. OneDriveDriver (`onedrive-driver.ts`)
- `listDir`: Calls `GET /me/drive/root:/{path}:/children` with pagination via @odata.nextLink
- `writeFile`: Two-path upload:
  - Small files (<4MB): `PUT /me/drive/root:/{path}:/content`
  - Large files: createUploadSession → PUT chunks with Content-Range headers
- `readFile`: Calls `GET /me/drive/root:/{path}:/content` (handles 302 redirect)
- `deleteFile/deleteDir`: Calls `DELETE /me/drive/root:/{path}`
- `createDir`: Calls `POST /me/drive/root:/{parent-path}:/children` with `{ name, folder: {} }`
- `getStorageInfo`: Calls `GET /me/drive?$select=quota`
- Supports path-based access via Graph API `root:/{path}:` syntax
- Added DriveItem interface type definition

### 5. GoogleDriver (`google-driver.ts`)
- `listDir`: Calls `GET /drive/v3/files?q='{parentId}'+in+parents` with pagination
- `writeFile`: Two-path upload:
  - Small files: multipart upload with boundary delimiter
  - Large files: resumable upload (initiate → PUT chunks with Content-Range)
- `readFile`: Calls `GET /drive/v3/files/{fileId}?alt=media`
- `deleteFile/deleteDir`: Calls `DELETE /drive/v3/files/{fileId}`
- `createDir`: Calls `POST /drive/v3/files` with mimeType="application/vnd.google-apps.folder"
- `getStorageInfo`: Calls `GET /drive/v3/about?fields=storageQuota`
- Implemented file ID based system with `resolvePathToFileId` method
- Path-to-ID cache for efficient traversal
- `findFileByName` for overwrite detection on upload
- Added GoogleDriveFile interface type definition

### 6. Drive115Driver (`115-driver.ts`)
- `login`: Calls `POST /webapi.115.com/user/login` with account/password, extracts cookies
- `listDir`: Calls `GET /webapi.115.com/files/filelist?cid={cid}` with CID-based identification
- `writeFile`: SHA1 pre-check + upload via `POST /uplb.115.com/3.0/initupload.php`
- `readFile`: Gets download URL via `/files/download?pickcode={id}`, then downloads
- `deleteFile/deleteDir`: Calls `POST /webapi.115.com/files/delete` with fid
- `createDir`: Calls `POST /webapi.115.com/files/add` with cname and pid
- `getStorageInfo`: Calls `GET /webapi.115.com/user/info`
- Uses CID-based directory identification (root CID = "0")
- Path-to-CID cache for efficient traversal
- SHA-1 hash calculation for deduplication check
- Cookie-based auth with auto re-login on 401/403

### 7. QuarkDriver (`quark-driver.ts`)
- `login`: Two methods: password login or SMS verification
  - Password: `POST /pan.quark.cn/account/login`
  - SMS: Request code → verify code → get cookies
- `listDir`: Calls `GET /pan.quark.cn/filelist?dir={fid}` with FID-based identification
- `writeFile`: Three-phase upload: precreate → upload via URL → complete
- `readFile`: Gets download URL via `POST /pan.quark.cn/file/download`, then downloads
- `deleteFile/deleteDir`: Calls `POST /pan.quark.cn/file/delete` with fid
- `createDir`: Calls `POST /pan.quark.cn/file/create_dir`
- `getStorageInfo`: Calls `GET /pan.quark.cn/user/info`
- Uses FID-based directory identification (root FID = "0")
- Path-to-FID cache for efficient traversal
- `requestSmsCode` method for SMS verification flow
- Cookie-based auth with auto re-login on 401/403

### 8. Index exports (`index.ts`)
- Added exports for: `cloud-driver-base`, `baidu-driver`, `aliyun-driver`, `onedrive-driver`, `google-driver`, `115-driver`, `quark-driver`

## Lint Status
- All changes pass `bun run lint` clean
- Dev server running without errors

## Files Modified
1. `/home/z/my-project/src/lib/storage-drivers/cloud-driver-base.ts` — Real HTTP fetch, apiRequest/cookieRequest helpers
2. `/home/z/my-project/src/lib/storage-drivers/baidu-driver.ts` — Full Baidu PCS API implementation
3. `/home/z/my-project/src/lib/storage-drivers/aliyun-driver.ts` — Full Aliyun Drive Open API implementation
4. `/home/z/my-project/src/lib/storage-drivers/onedrive-driver.ts` — Full Microsoft Graph API implementation
5. `/home/z/my-project/src/lib/storage-drivers/google-driver.ts` — Full Google Drive API implementation
6. `/home/z/my-project/src/lib/storage-drivers/115-driver.ts` — Full 115 API implementation
7. `/home/z/my-project/src/lib/storage-drivers/quark-driver.ts` — Full Quark Drive API implementation
8. `/home/z/my-project/src/lib/storage-drivers/index.ts` — Added all cloud driver exports
