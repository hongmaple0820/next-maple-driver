"use client";

import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { Pencil } from "lucide-react";

export function RenameDialog() {
  const { renameFile, setRenameFile } = useFileStore();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (renameFile) {
      setName(renameFile.name);
    }
  }, [renameFile]);

  const handleRename = async () => {
    if (!renameFile || !name.trim() || name.trim() === renameFile.name) return;
    setLoading(true);
    try {
      const res = await fetch("/api/files", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: renameFile.id, name: name.trim() }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["files"] });
        setRenameFile(null);
      }
    } catch {
      // Error handled silently
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) setRenameFile(null);
  };

  return (
    <Dialog open={!!renameFile} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-5 h-5 text-emerald-600" />
            Rename
          </DialogTitle>
          <DialogDescription>
            Enter a new name for this item.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label htmlFor="rename-name">Name</Label>
            <Input
              id="rename-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) handleRename();
              }}
              autoFocus
              onFocus={(e) => {
                // Select filename without extension
                const dotIndex = name.lastIndexOf(".");
                if (dotIndex > 0) {
                  e.target.setSelectionRange(0, dotIndex);
                } else {
                  e.target.select();
                }
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setRenameFile(null)}>
            Cancel
          </Button>
          <Button
            onClick={handleRename}
            disabled={!name.trim() || name.trim() === renameFile?.name || loading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {loading ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
