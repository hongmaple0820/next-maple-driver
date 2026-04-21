import { create } from "zustand";

export type ThemePreference = "light" | "dark" | "system";
export type DefaultViewMode = "grid" | "list";
export type DefaultSortField = "name" | "updatedAt" | "size" | "type";
export type DefaultSortDirection = "asc" | "desc";

export interface UserPreferences {
  defaultViewMode: DefaultViewMode;
  defaultSortField: DefaultSortField;
  defaultSortDirection: DefaultSortDirection;
  theme: ThemePreference;
  compactMode: boolean;
  showExtensions: boolean;
  showHiddenFiles: boolean;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  defaultViewMode: "grid",
  defaultSortField: "name",
  defaultSortDirection: "asc",
  theme: "system",
  compactMode: false,
  showExtensions: true,
  showHiddenFiles: false,
};

const STORAGE_KEY = "clouddrive-user-preferences";

function loadPreferences(): UserPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
    }
  } catch {
    // ignore parse errors
  }
  return DEFAULT_PREFERENCES;
}

function savePreferences(prefs: UserPreferences): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore storage errors
  }
}

interface UserPreferencesStore extends UserPreferences {
  setPreference: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void;
  setPreferences: (prefs: Partial<UserPreferences>) => void;
  resetPreferences: () => void;
}

export const useUserPreferences = create<UserPreferencesStore>((set) => {
  const initial = loadPreferences();

  return {
    ...initial,

    setPreference: (key, value) =>
      set((state) => {
        const newState = { ...state, [key]: value };
        savePreferences(newState);
        return { [key]: value } as Partial<UserPreferencesStore>;
      }),

    setPreferences: (prefs) =>
      set((state) => {
        const newState = { ...state, ...prefs };
        savePreferences(newState as UserPreferences);
        return prefs;
      }),

    resetPreferences: () => {
      savePreferences(DEFAULT_PREFERENCES);
      set(DEFAULT_PREFERENCES);
    },
  };
});
