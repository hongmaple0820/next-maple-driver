"use client";

import { useUserPreferences, type ThemePreference, type DefaultViewMode, type DefaultSortField, type DefaultSortDirection } from "@/lib/user-preferences";
import { useFileStore } from "@/store/file-store";
import { useTheme } from "next-themes";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  LayoutGrid,
  List,
  Sun,
  Moon,
  Monitor,
  Settings,
  Eye,
  EyeOff,
  Minimize2,
  RotateCcw,
  FileSearch,
  ArrowUpDown,
} from "lucide-react";

interface PreferencesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserPreferencesDialog({ open, onOpenChange }: PreferencesDialogProps) {
  const prefs = useUserPreferences();
  const { setViewMode, setSortBy, setSortDirection, setCompactMode, setShowExtensions } = useFileStore();
  const { setTheme, theme: currentTheme } = useTheme();

  const handleViewModeChange = (value: DefaultViewMode) => {
    prefs.setPreference("defaultViewMode", value);
    setViewMode(value);
  };

  const handleSortFieldChange = (value: DefaultSortField) => {
    prefs.setPreference("defaultSortField", value);
    setSortBy(value);
  };

  const handleSortDirectionChange = (value: DefaultSortDirection) => {
    prefs.setPreference("defaultSortDirection", value);
    setSortDirection(value);
  };

  const handleThemeChange = (value: ThemePreference) => {
    prefs.setPreference("theme", value);
    setTheme(value);
  };

  const handleCompactModeChange = (checked: boolean) => {
    prefs.setPreference("compactMode", checked);
    setCompactMode(checked);
  };

  const handleShowExtensionsChange = (checked: boolean) => {
    prefs.setPreference("showExtensions", checked);
    setShowExtensions(checked);
  };

  const handleShowHiddenFilesChange = (checked: boolean) => {
    prefs.setPreference("showHiddenFiles", checked);
  };

  const handleReset = () => {
    prefs.resetPreferences();
    // Apply defaults
    setViewMode(DEFAULT_PREFERENCES.defaultViewMode);
    setSortBy(DEFAULT_PREFERENCES.defaultSortField);
    setSortDirection(DEFAULT_PREFERENCES.defaultSortDirection);
    setTheme(DEFAULT_PREFERENCES.theme);
    setCompactMode(DEFAULT_PREFERENCES.compactMode);
    setShowExtensions(DEFAULT_PREFERENCES.showExtensions);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-emerald-600" />
            Preferences
          </DialogTitle>
          <DialogDescription>
            Customize your CloudDrive experience
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="general" className="mt-2">
          <TabsList className="w-full">
            <TabsTrigger value="general" className="flex-1 gap-1.5">
              <LayoutGrid className="w-3.5 h-3.5" />
              General
            </TabsTrigger>
            <TabsTrigger value="appearance" className="flex-1 gap-1.5">
              <Sun className="w-3.5 h-3.5" />
              Appearance
            </TabsTrigger>
            <TabsTrigger value="advanced" className="flex-1 gap-1.5">
              <Eye className="w-3.5 h-3.5" />
              Advanced
            </TabsTrigger>
          </TabsList>

          {/* General Tab */}
          <TabsContent value="general" className="space-y-5 mt-4">
            {/* Default View Mode */}
            <div className="space-y-3">
              <Label className="text-sm font-medium flex items-center gap-2">
                <LayoutGrid className="w-4 h-4 text-muted-foreground" />
                Default View Mode
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleViewModeChange("grid")}
                  className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                    prefs.defaultViewMode === "grid"
                      ? "border-emerald-500 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                      : "border-border hover:border-border/80 hover:bg-accent/30"
                  }`}
                >
                  <LayoutGrid className="w-6 h-6" />
                  <span className="text-xs font-medium">Grid</span>
                </button>
                <button
                  onClick={() => handleViewModeChange("list")}
                  className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                    prefs.defaultViewMode === "list"
                      ? "border-emerald-500 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                      : "border-border hover:border-border/80 hover:bg-accent/30"
                  }`}
                >
                  <List className="w-6 h-6" />
                  <span className="text-xs font-medium">List</span>
                </button>
              </div>
            </div>

            <Separator />

            {/* Default Sort */}
            <div className="space-y-3">
              <Label className="text-sm font-medium flex items-center gap-2">
                <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
                Default Sort Order
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Sort by</Label>
                  <Select
                    value={prefs.defaultSortField}
                    onValueChange={(v) => handleSortFieldChange(v as DefaultSortField)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name">Name</SelectItem>
                      <SelectItem value="updatedAt">Modified</SelectItem>
                      <SelectItem value="size">Size</SelectItem>
                      <SelectItem value="type">Type</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Direction</Label>
                  <Select
                    value={prefs.defaultSortDirection}
                    onValueChange={(v) => handleSortDirectionChange(v as DefaultSortDirection)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asc">Ascending</SelectItem>
                      <SelectItem value="desc">Descending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Appearance Tab */}
          <TabsContent value="appearance" className="space-y-5 mt-4">
            {/* Theme */}
            <div className="space-y-3">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Sun className="w-4 h-4 text-muted-foreground" />
                Theme
              </Label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => handleThemeChange("light")}
                  className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                    prefs.theme === "light"
                      ? "border-emerald-500 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                      : "border-border hover:border-border/80 hover:bg-accent/30"
                  }`}
                >
                  <Sun className="w-6 h-6" />
                  <span className="text-xs font-medium">Light</span>
                </button>
                <button
                  onClick={() => handleThemeChange("dark")}
                  className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                    prefs.theme === "dark"
                      ? "border-emerald-500 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                      : "border-border hover:border-border/80 hover:bg-accent/30"
                  }`}
                >
                  <Moon className="w-6 h-6" />
                  <span className="text-xs font-medium">Dark</span>
                </button>
                <button
                  onClick={() => handleThemeChange("system")}
                  className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                    prefs.theme === "system"
                      ? "border-emerald-500 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                      : "border-border hover:border-border/80 hover:bg-accent/30"
                  }`}
                >
                  <Monitor className="w-6 h-6" />
                  <span className="text-xs font-medium">System</span>
                </button>
              </div>
            </div>

            <Separator />

            {/* Compact Mode */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Minimize2 className="w-4 h-4 text-muted-foreground" />
                  Compact Mode
                </Label>
                <p className="text-xs text-muted-foreground">
                  Reduce card sizes and spacing for power users
                </p>
              </div>
              <Switch
                checked={prefs.compactMode}
                onCheckedChange={handleCompactModeChange}
              />
            </div>

            <Separator />

            {/* Show File Extensions */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <FileSearch className="w-4 h-4 text-muted-foreground" />
                  Show File Extensions
                </Label>
                <p className="text-xs text-muted-foreground">
                  Display extension badges on file cards
                </p>
              </div>
              <Switch
                checked={prefs.showExtensions}
                onCheckedChange={handleShowExtensionsChange}
              />
            </div>
          </TabsContent>

          {/* Advanced Tab */}
          <TabsContent value="advanced" className="space-y-5 mt-4">
            {/* Show Hidden Files */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium flex items-center gap-2">
                  {prefs.showHiddenFiles ? (
                    <Eye className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <EyeOff className="w-4 h-4 text-muted-foreground" />
                  )}
                  Show Hidden Files
                </Label>
                <p className="text-xs text-muted-foreground">
                  Display files and folders that start with a dot (coming soon)
                </p>
              </div>
              <Switch
                checked={prefs.showHiddenFiles}
                onCheckedChange={handleShowHiddenFilesChange}
              />
            </div>

            <Separator />

            {/* Reset Preferences */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Reset to Defaults</Label>
                <p className="text-xs text-muted-foreground">
                  Restore all preferences to their default values
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

const DEFAULT_PREFERENCES = {
  defaultViewMode: "grid" as DefaultViewMode,
  defaultSortField: "name" as DefaultSortField,
  defaultSortDirection: "asc" as DefaultSortDirection,
  theme: "system" as ThemePreference,
  compactMode: false,
  showExtensions: true,
  showHiddenFiles: false,
};
