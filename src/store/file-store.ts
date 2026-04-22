import { create } from "zustand";
import type { FileItem } from "@/lib/file-utils";

export type ViewMode = "grid" | "list";
export type Section = "files" | "starred" | "trash" | "recent";
export type SortField = "name" | "updatedAt" | "size" | "type";
export type SortDirection = "asc" | "desc";
export type FileTypeFilter = "all" | "images" | "videos" | "audio" | "documents" | "code" | "archives";
export type ColorLabelFilter = "" | "red" | "orange" | "yellow" | "green" | "blue" | "purple" | "pink" | "gray";

export interface UploadProgress {
  id: string;
  fileName: string;
  progress: number;
  status: "uploading" | "done" | "error";
}

export interface ActivityItem {
  id: string;
  action: "upload" | "download" | "rename" | "delete" | "star" | "share" | "move" | "copy" | "create";
  fileName: string;
  timestamp: number;
}

interface FileStore {
  // Navigation
  currentFolderId: string;
  setCurrentFolderId: (id: string, skipHistory?: boolean) => void;
  navigationHistory: string[];
  historyIndex: number;
  navigateBack: () => void;
  navigateForward: () => void;
  canNavigateBack: () => boolean;
  canNavigateForward: () => boolean;

  // Section
  section: Section;
  setSection: (section: Section) => void;

  // View mode
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  // Search
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchResultCount: number;
  setSearchResultCount: (count: number) => void;

  // Sort
  sortBy: SortField;
  sortDirection: SortDirection;
  setSortBy: (field: SortField) => void;
  setSortDirection: (dir: SortDirection) => void;
  toggleSort: (field: SortField) => void;

  // Type filter
  typeFilter: FileTypeFilter;
  setTypeFilter: (filter: FileTypeFilter) => void;

  // Color label filter
  colorLabelFilter: ColorLabelFilter;
  setColorLabelFilter: (filter: ColorLabelFilter) => void;

  // Selection
  selectedFileIds: Set<string>;
  toggleSelect: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;

  // Upload progress
  uploadProgress: UploadProgress[];
  addUploadProgress: (upload: UploadProgress) => void;
  updateUploadProgress: (id: string, progress: number, status?: UploadProgress["status"]) => void;
  removeUploadProgress: (id: string) => void;
  clearUploadProgress: () => void;

  // Sidebar
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  // Clipboard (for copy/cut operations)
  clipboard: { fileIds: string[]; operation: "copy" | "cut" } | null;
  setClipboard: (clipboard: { fileIds: string[]; operation: "copy" | "cut" } | null) => void;

  // Keyboard shortcuts dialog
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;

  // User preferences dialog
  preferencesOpen: boolean;
  setPreferencesOpen: (open: boolean) => void;

  // Compact mode (from preferences)
  compactMode: boolean;
  setCompactMode: (compact: boolean) => void;

  // Show file extensions (from preferences)
  showExtensions: boolean;
  setShowExtensions: (show: boolean) => void;

  // Activity log
  activities: ActivityItem[];
  addActivity: (activity: Omit<ActivityItem, "id" | "timestamp">) => void;
  clearActivities: () => void;

  // Detail panel
  detailFile: FileItem | null;
  setDetailFile: (file: FileItem | null) => void;

  // Batch rename dialog
  batchRenameOpen: boolean;
  setBatchRenameOpen: (open: boolean) => void;

  // Dialogs
  createFolderOpen: boolean;
  setCreateFolderOpen: (open: boolean) => void;

  renameFile: { id: string; name: string } | null;
  setRenameFile: (file: { id: string; name: string } | null) => void;

  moveFile: { id: string; name: string; parentId: string } | null;
  setMoveFile: (file: { id: string; name: string; parentId: string } | null) => void;

  shareFile: { id: string; name: string } | null;
  setShareFile: (file: { id: string; name: string } | null) => void;

  propertiesFile: { id: string; name: string } | null;
  setPropertiesFile: (file: { id: string; name: string } | null) => void;

  previewFile: { id: string; name: string; type: string; mimeType?: string; url?: string } | null;
  setPreviewFile: (file: { id: string; name: string; type: string; mimeType?: string; url?: string } | null) => void;
}

export const useFileStore = create<FileStore>((set) => ({
  // Navigation
  currentFolderId: "root",
  navigationHistory: ["root"],
  historyIndex: 0,
  setCurrentFolderId: (id, skipHistory = false) =>
    set((state) => {
      if (skipHistory) {
        return { currentFolderId: id, selectedFileIds: new Set() };
      }
      // Trim any forward history when navigating to a new folder
      const newHistory = state.navigationHistory.slice(0, state.historyIndex + 1);
      newHistory.push(id);
      return {
        currentFolderId: id,
        selectedFileIds: new Set(),
        navigationHistory: newHistory,
        historyIndex: newHistory.length - 1,
      };
    }),
  navigateBack: () =>
    set((state) => {
      if (state.historyIndex <= 0) return state;
      const newIndex = state.historyIndex - 1;
      return {
        currentFolderId: state.navigationHistory[newIndex],
        historyIndex: newIndex,
        selectedFileIds: new Set(),
      };
    }),
  navigateForward: () =>
    set((state) => {
      if (state.historyIndex >= state.navigationHistory.length - 1) return state;
      const newIndex = state.historyIndex + 1;
      return {
        currentFolderId: state.navigationHistory[newIndex],
        historyIndex: newIndex,
        selectedFileIds: new Set(),
      };
    }),
  canNavigateBack: () => {
    const state = useFileStore.getState();
    return state.historyIndex > 0;
  },
  canNavigateForward: () => {
    const state = useFileStore.getState();
    return state.historyIndex < state.navigationHistory.length - 1;
  },

  // Section
  section: "files",
  setSection: (section) =>
    set({ section, currentFolderId: "root", selectedFileIds: new Set(), searchQuery: "", typeFilter: "all" as FileTypeFilter, colorLabelFilter: "" as ColorLabelFilter, searchResultCount: 0, navigationHistory: ["root"], historyIndex: 0 }),

  // View mode
  viewMode: "grid",
  setViewMode: (mode) => set({ viewMode: mode }),

  // Search
  searchQuery: "",
  setSearchQuery: (query) => set({ searchQuery: query }),
  searchResultCount: 0,
  setSearchResultCount: (count) => set({ searchResultCount: count }),

  // Sort
  sortBy: "name",
  sortDirection: "asc",
  setSortBy: (field) => set({ sortBy: field }),
  setSortDirection: (dir) => set({ sortDirection: dir }),
  toggleSort: (field) => set((state) => ({
    sortBy: field,
    sortDirection: state.sortBy === field ? (state.sortDirection === "asc" ? "desc" : "asc") : "asc",
  })),

  // Type filter
  typeFilter: "all" as FileTypeFilter,
  setTypeFilter: (filter) => set({ typeFilter: filter }),

  // Color label filter
  colorLabelFilter: "" as ColorLabelFilter,
  setColorLabelFilter: (filter) => set({ colorLabelFilter: filter }),

  // Selection
  selectedFileIds: new Set<string>(),
  toggleSelect: (id) =>
    set((state) => {
      const next = new Set(state.selectedFileIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { selectedFileIds: next };
    }),
  selectAll: (ids) => set({ selectedFileIds: new Set(ids) }),
  clearSelection: () => set({ selectedFileIds: new Set() }),

  // Upload progress
  uploadProgress: [],
  addUploadProgress: (upload) =>
    set((state) => ({ uploadProgress: [...state.uploadProgress, upload] })),
  updateUploadProgress: (id, progress, status) =>
    set((state) => ({
      uploadProgress: state.uploadProgress.map((u) =>
        u.id === id ? { ...u, progress, status: status ?? u.status } : u
      ),
    })),
  removeUploadProgress: (id) =>
    set((state) => ({
      uploadProgress: state.uploadProgress.filter((u) => u.id !== id),
    })),
  clearUploadProgress: () => set({ uploadProgress: [] }),

  // Clipboard
  clipboard: null,
  setClipboard: (clipboard) => set({ clipboard }),

  // Keyboard shortcuts dialog
  shortcutsOpen: false,
  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),

  // User preferences dialog
  preferencesOpen: false,
  setPreferencesOpen: (open) => set({ preferencesOpen: open }),

  // Compact mode
  compactMode: false,
  setCompactMode: (compact) => set({ compactMode: compact }),

  // Show extensions
  showExtensions: true,
  setShowExtensions: (show) => set({ showExtensions: show }),

  // Activity log
  activities: [],
  addActivity: (activity) =>
    set((state) => ({
      activities: [
        { ...activity, id: crypto.randomUUID(), timestamp: Date.now() },
        ...state.activities,
      ].slice(0, 50), // Keep max 50 items
    })),
  clearActivities: () => set({ activities: [] }),

  // Sidebar
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  // Batch rename dialog
  batchRenameOpen: false,
  setBatchRenameOpen: (open) => set({ batchRenameOpen: open }),

  // Detail panel
  detailFile: null,
  setDetailFile: (file) => set({ detailFile: file }),

  // Dialogs
  createFolderOpen: false,
  setCreateFolderOpen: (open) => set({ createFolderOpen: open }),

  renameFile: null,
  setRenameFile: (file) => set({ renameFile: file }),

  moveFile: null,
  setMoveFile: (file) => set({ moveFile: file }),

  shareFile: null,
  setShareFile: (file) => set({ shareFile: file }),

  propertiesFile: null,
  setPropertiesFile: (file) => set({ propertiesFile: file }),

  previewFile: null,
  setPreviewFile: (file) => set({ previewFile: file }),
}));
