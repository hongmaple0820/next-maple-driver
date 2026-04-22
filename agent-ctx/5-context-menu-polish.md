---
Task ID: 5-context-menu-polish
Agent: Context Menu & Polish Agent
Task: Add Right-Click Context Menu on Empty Area + UI Polish

Work Log:
- Feature 1: Right-Click Context Menu on Empty Area
  - Added clipboard state to file-store.ts: `clipboard: { fileIds: string[]; operation: 'copy' | 'cut' } | null` with setClipboard action
  - Updated file-grid.tsx: wrapped grid/empty area in ContextMenu component; right-clicking empty space shows:
    - "New Folder" → opens create folder dialog
    - "Upload Files" → triggers hidden file input for upload with toast notifications
    - "Paste" → only appears when clipboard has items; supports copy (via /api/files/copy) and cut (via /api/files/move)
    - "Select All" → selects all files in current view
    - "Sort by" → submenu with Name, Modified, Size, Type options
  - Updated file-list.tsx: same context menu on the table area for empty space right-click
  - Hidden file input element with ref for programmatic upload triggering

- Feature 2: Better Loading Skeletons
  - Updated file-grid.tsx: replaced pulsing rectangles with card-like skeletons using shadcn Skeleton component
    - Rounded card with circle placeholder for icon area, text line for filename, shorter text line for metadata
  - Updated file-list.tsx: replaced pulsing rectangles with table-row-like skeletons
    - Row with small square for icon, longer bar for name, shorter bars for size/type/date columns

- Feature 3: Sidebar Animations and Visual Details
  - Added hover translateX animation on nav items: `hover:translate-x-0.5` with transition-all duration-200
  - Added active indicator bar: emerald vertical bar (3px wide, rounded) on left side of active nav item using framer-motion layoutId for smooth transitions between items
  - Added gradient background on active nav item: `bg-gradient-to-r from-emerald-600/10 to-emerald-600/5`
  - Added smooth expand/collapse animation for storage detail section using framer-motion AnimatePresence + motion.div (height 0 → auto, opacity 0 → 1)

- Feature 4: Improved File Card Design
  - Added subtle gradient overlay at bottom of card for text readability: `bg-gradient-to-t from-card/90 to-transparent`
  - Added "last modified" tooltip on filename hover using shadcn Tooltip component showing "Modified X ago"
  - Improved selection animation: using framer-motion layout animation + spring animation for selection checkmark (initial scale:0 → animate scale:1)
  - Added file extension badge (.txt, .pdf etc.) on the card as a small Badge component with font-mono styling

- Feature 5: File Detail Panel Polish
  - Added "Location" info row showing the file's parent folder path (fetched via breadcrumb API)
  - Added file extension as a Badge next to the filename (e.g., ".txt" badge)
  - Added staggered entrance animation for each info row using framer-motion (incremental delay: 0, 0.03, 0.06, ...)
  - Imported MapPin icon for Location row

- 6 files modified (file-store.ts, file-grid.tsx, file-list.tsx, file-sidebar.tsx, file-card.tsx, file-detail-panel.tsx)
- All changes pass lint check, dev server running without errors

Stage Summary:
- Right-click context menu on empty area in both grid and list views with New Folder, Upload, Paste, Select All, Sort by
- Clipboard state added to store for copy/cut/paste operations
- Loading skeletons replaced with realistic card/row shapes using shadcn Skeleton
- Sidebar enhanced with active indicator bar, gradient background, hover translateX, and animated storage detail
- File cards improved with gradient overlay, tooltip, extension badge, and smooth selection animation
- File detail panel enhanced with Location row, extension badge, and staggered entrance animations
- Lint clean, no errors
