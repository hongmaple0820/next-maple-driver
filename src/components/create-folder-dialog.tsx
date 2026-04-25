"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useFileStore } from "@/store/file-store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FolderPlus, Folder } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const FOLDER_COLORS = [
  { id: "default", color: "bg-amber-500", border: "border-amber-500/30", iconColor: "text-amber-500", label: "Yellow" },
  { id: "red", color: "bg-red-500", border: "border-red-500/30", iconColor: "text-red-500", label: "Red" },
  { id: "green", color: "bg-emerald-500", border: "border-emerald-500/30", iconColor: "text-emerald-500", label: "Green" },
  { id: "blue", color: "bg-sky-500", border: "border-sky-500/30", iconColor: "text-sky-500", label: "Blue" },
  { id: "purple", color: "bg-purple-500", border: "border-purple-500/30", iconColor: "text-purple-500", label: "Purple" },
  { id: "gray", color: "bg-gray-400", border: "border-gray-400/30", iconColor: "text-gray-400", label: "Gray" },
];

export function CreateFolderDialog() {
  const { createFolderOpen, setCreateFolderOpen, currentFolderId, addActivity } = useFileStore();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedColor, setSelectedColor] = useState("default");

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const body: Record<string, string> = {
        name: name.trim(),
        parentId: currentFolderId,
      };
      if (selectedColor !== "default") {
        body.colorLabel = selectedColor;
      }
      const res = await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["files"] });
        addActivity({ action: "create", fileName: name.trim() });
        setName("");
        setSelectedColor("default");
        setCreateFolderOpen(false);
      }
    } catch {
      // Error handled silently
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setName("");
      setSelectedColor("default");
    }
    setCreateFolderOpen(open);
  };

  const activeColorObj = FOLDER_COLORS.find((c) => c.id === selectedColor) ?? FOLDER_COLORS[0];

  return (
    <Dialog open={createFolderOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus className="w-5 h-5 text-emerald-600" />
            New Folder
          </DialogTitle>
          <DialogDescription>
            Create a new folder in the current directory.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Folder preview */}
          <motion.div
            key={name + selectedColor}
            initial={{ opacity: 0.5, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/30"
          >
            <div className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center border",
              activeColorObj.color.replace("bg-", "bg-").concat("/15"),
              activeColorObj.border
            )}>
              <Folder className={cn("w-7 h-7", activeColorObj.iconColor)} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">
                {name.trim() || "Untitled Folder"}
              </p>
              <p className="text-xs text-muted-foreground">New folder</p>
            </div>
          </motion.div>

          {/* Folder name input */}
          <div className="space-y-2">
            <Label htmlFor="folder-name">Folder Name</Label>
            <Input
              id="folder-name"
              placeholder="Enter folder name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) handleCreate();
              }}
              autoFocus
            />
          </div>

          {/* Color picker */}
          <div className="space-y-2">
            <Label>Folder Color</Label>
            <div className="flex items-center gap-2">
              {FOLDER_COLORS.map((color) => (
                <button
                  key={color.id}
                  onClick={() => setSelectedColor(color.id)}
                  className={cn(
                    "w-8 h-8 rounded-full transition-all duration-150 flex items-center justify-center",
                    color.color,
                    selectedColor === color.id
                      ? "ring-2 ring-foreground ring-offset-2 ring-offset-background scale-110"
                      : "hover:scale-110 opacity-70 hover:opacity-100"
                  )}
                  title={color.label}
                >
                  {selectedColor === color.id && (
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || loading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {loading ? t.app.creating : t.app.create}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
