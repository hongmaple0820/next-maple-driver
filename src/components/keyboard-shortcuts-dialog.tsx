"use client";

import { useFileStore } from "@/store/file-store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const shortcuts = [
  { keys: ["Ctrl", "A"], label: "Select All", macKeys: ["⌘", "A"] },
  { keys: ["Delete"], label: "Move to Trash", macKeys: ["⌫"] },
  { keys: ["F2"], label: "Rename", macKeys: ["F2"] },
  { keys: ["Esc"], label: "Clear Selection / Close Panel", macKeys: ["⎋"] },
  { keys: ["Enter"], label: "Open / Preview", macKeys: ["↵"] },
  { keys: ["?"], label: "Show this help", macKeys: ["?"] },
  { keys: ["Ctrl", "C"], label: "Copy", macKeys: ["⌘", "C"] },
  { keys: ["Ctrl", "X"], label: "Cut", macKeys: ["⌘", "X"] },
  { keys: ["Ctrl", "V"], label: "Paste", macKeys: ["⌘", "V"] },
];

function KeyBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center justify-center bg-muted border border-border rounded px-2 py-0.5 text-xs font-mono min-w-[28px]">
      {children}
    </span>
  );
}

export function KeyboardShortcutsDialog() {
  const { shortcutsOpen, setShortcutsOpen } = useFileStore();

  return (
    <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 py-2">
          {shortcuts.map((shortcut) => (
            <div key={shortcut.label} className="flex items-center gap-2">
              <div className="flex items-center gap-1 shrink-0">
                {shortcut.keys.map((key, i) => (
                  <span key={i}>
                    <KeyBadge>{key}</KeyBadge>
                    {i < shortcut.keys.length - 1 && (
                      <span className="text-muted-foreground text-xs mx-0.5">+</span>
                    )}
                  </span>
                ))}
              </div>
              <span className="text-sm text-muted-foreground truncate">
                {shortcut.label}
              </span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
