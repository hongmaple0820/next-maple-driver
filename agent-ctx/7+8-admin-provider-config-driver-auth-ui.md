# Task 7+8: Admin Cloud Provider Configuration UI & Driver Authorization UI

## Summary
Improved two related areas of the Maple Driver project:
1. **Admin Cloud Provider Configuration UI** - Added a "Cloud Providers" section in the admin panel for managing global OAuth credentials
2. **Frontend Driver Authorization UI** - Created a new DriverAuthorizationDialog supporting OAuth redirect, Cookie input, and QR code login flows

## Changes Made

### New Files

1. **`/src/app/api/admin/cloud-providers/route.ts`** - New API endpoint
   - `GET`: Returns current OAuth config for each cloud provider (clientId only, never exposes secrets)
   - `PUT`: Updates OAuth config (clientId, clientSecret, redirectUri, tenantId) for each provider
   - Stores credentials in special `StorageDriver` records with IDs like `provider-baidu`, `provider-aliyun`, etc.
   - Admin-only access (checks user role)

2. **`/src/components/admin/cloud-providers-section.tsx`** - New component
   - "Cloud Providers" section showing all 6 cloud driver types
   - OAuth providers (Baidu, Aliyun, OneDrive, Google): Shows Client ID, Client Secret, Redirect URI, Tenant ID input fields
   - Cookie-based providers (115, Quark): Shows info card only (no OAuth config needed)
   - Configured/unconfigured status badges
   - "Save" button persists changes via the API endpoint

3. **`/src/components/driver-authorization-dialog.tsx`** - New component
   - **OAuth flow** (Baidu, Aliyun, OneDrive, Google):
     - "前往授权" button opens popup with authorization URL
     - Polls for popup closure to detect completion
     - Shows waiting state with spinner
   - **Cookie input** (115, Quark):
     - Textarea for pasting cookies from browser DevTools
     - Step-by-step instructions on how to get cookies
     - "保存并验证" button validates cookies via API
     - Shows success/error state
   - **QR code login** (115, Quark):
     - "获取二维码" button requests QR code from `/api/drivers/[id]/qr-login` GET
     - Displays QR code image
     - Polls `/api/drivers/[id]/qr-login` POST every 2 seconds for status
     - Status flow: waiting → scanned → confirmed (success)
     - Handles expired QR codes with refresh button
   - Auth status badge (已授权/待授权/已过期/错误)
   - Chinese language throughout

### Modified Files

4. **`/src/components/admin/admin-drivers-tab.tsx`**
   - Imported `CloudProvidersSection` component
   - Added `<CloudProvidersSection />` above the drivers list header

5. **`/src/components/my-drives-panel.tsx`**
   - Imported `DriverAuthorizationDialog` component
   - Added `authDialogOpen` and `authDriver` state variables
   - Added `handleAuthorize` callback
   - Updated `AddDriveDialog` to accept `onDriverCreated` prop
   - After cloud driver creation, automatically opens `DriverAuthorizationDialog`
   - Updated `DriverCard` component:
     - Added `onAuthorize` optional prop
     - "重新授权" button now opens `DriverAuthorizationDialog` instead of calling reauth directly
     - Shows "去授权" for pending/expired/error status drivers
   - Added `<DriverAuthorizationDialog>` component instance in the render tree

## Architecture Decisions
- OAuth credentials are stored in `StorageDriver` records with special IDs (`provider-*`) to avoid creating a new database table
- The `DriverAuthorizationDialog` uses Tabs to switch between Cookie and QR code login modes for 115/Quark
- QR code polling uses `setInterval` with 2-second interval and proper cleanup on unmount
- The dialog resets all internal state when opened/closed to avoid stale data
- After creating a cloud driver in `AddDriveDialog`, it triggers the authorization dialog with a small delay for smooth UX transition
