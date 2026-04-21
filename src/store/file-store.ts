import { create } from "zustand";

export type ViewMode = "grid" | "list";
export type Section = "files" | "starred" | "trash" | "recent";

export interface UploadProgress {
  id: string;
  fileName: string;
  progress: number;
  status: "uploading" | "done" | "error";
}

interface FileStore {
  // Navigation
  currentFolderId: string;
  setCurrentFolderId: (id: string) => void;

  // Section
  section: Section;
  setSection: (section: Section) => void;

  // View mode
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  // Search
  searchQuery: string;
  setSearchQuery: (query: string) => void;

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

  // Dialogs
  createFolderOpen: boolean;
  setCreateFolderOpen: (open: boolean) => void;

  renameFile: { id: string; name: string } | null;
  setRenameFile: (file: { id: string; name: string } | null) => void;

  moveFile: { id: string; name: string; parentId: string } | null;
  setMoveFile: (file: { id: string; name: string; parentId: string } | null) => void;

  shareFile: { id: string; name: string } | null;
  setShareFile: (file: { id: string; name: string } | null) => void;

  previewFile: { id: string; name: string; type: string; mimeType?: string; url?: string } | null;
  setPreviewFile: (file: { id: string; name: string; type: string; mimeType?: string; url?: string } | null) => void;
}

export const useFileStore = create<FileStore>((set) => ({
  // Navigation
  currentFolderId: "root",
  setCurrentFolderId: (id) =>
    set({ currentFolderId: id, selectedFileIds: new Set() }),

  // Section
  section: "files",
  setSection: (section) =>
    set({ section, currentFolderId: "root", selectedFileIds: new Set(), searchQuery: "" }),

  // View mode
  viewMode: "grid",
  setViewMode: (mode) => set({ viewMode: mode }),

  // Search
  searchQuery: "",
  setSearchQuery: (query) => set({ searchQuery: query }),

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

  // Sidebar
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  // Dialogs
  createFolderOpen: false,
  setCreateFolderOpen: (open) => set({ createFolderOpen: open }),

  renameFile: null,
  setRenameFile: (file) => set({ renameFile: file }),

  moveFile: null,
  setMoveFile: (file) => set({ moveFile: file }),

  shareFile: null,
  setShareFile: (file) => set({ shareFile: file }),

  previewFile: null,
  setPreviewFile: (file) => set({ previewFile: file }),
}));
