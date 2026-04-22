"use client";

import { useFileStore } from "@/store/file-store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  ArrowRight,
  Home,
  ListChecks,
  Trash2,
  Pencil,
  X,
  CornerDownLeft,
  HelpCircle,
  Copy,
  Scissors,
  ClipboardPaste,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface ShortcutItem {
  keys: string[];
  label: string;
  macKeys: string[];
  icon: LucideIcon;
}

const shortcuts: ShortcutItem[] = [
  { keys: ["Alt", "←"], label: "Navigate Back", macKeys: ["⌥", "←"], icon: ArrowLeft },
  { keys: ["Alt", "→"], label: "Navigate Forward", macKeys: ["⌥", "→"], icon: ArrowRight },
  { keys: ["Alt", "Home"], label: "Go to All Files", macKeys: ["⌥", "↖"], icon: Home },
  { keys: ["Ctrl", "A"], label: "Select All", macKeys: ["⌘", "A"], icon: ListChecks },
  { keys: ["Delete"], label: "Move to Trash", macKeys: ["⌫"], icon: Trash2 },
  { keys: ["F2"], label: "Rename", macKeys: ["F2"], icon: Pencil },
  { keys: ["Esc"], label: "Clear Selection / Close", macKeys: ["⎋"], icon: X },
  { keys: ["Enter"], label: "Open / Preview", macKeys: ["↵"], icon: CornerDownLeft },
  { keys: ["?"], label: "Show this help", macKeys: ["?"], icon: HelpCircle },
  { keys: ["Ctrl", "C"], label: "Copy", macKeys: ["⌘", "C"], icon: Copy },
  { keys: ["Ctrl", "X"], label: "Cut", macKeys: ["⌘", "X"], icon: Scissors },
  { keys: ["Ctrl", "V"], label: "Paste", macKeys: ["⌘", "V"], icon: ClipboardPaste },
];

function KeyBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center justify-center bg-muted border border-border rounded px-2 py-0.5 text-xs font-mono min-w-[28px] shadow-sm">
      {children}
    </span>
  );
}

export function KeyboardShortcutsDialog() {
  const { shortcutsOpen, setShortcutsOpen } = useFileStore();

  return (
    <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
        {/* Gradient header bar */}
        <div className="bg-gradient-to-r from-emerald-600/10 via-emerald-500/5 to-transparent px-6 pt-6 pb-4 border-b border-border/50">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <HelpCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </span>
              Keyboard Shortcuts
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6 pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2.5">
            {shortcuts.map((shortcut) => {
              const Icon = shortcut.icon;
              return (
                <div
                  key={shortcut.label}
                  className="flex items-center gap-3 py-1.5 px-2 rounded-md hover:bg-accent/50 transition-colors"
                >
                  <Icon className="w-4 h-4 text-muted-foreground/70 shrink-0" />
                  <span className="text-sm text-muted-foreground truncate flex-1 min-w-0">
                    {shortcut.label}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {shortcut.keys.map((key, i) => (
                      <span key={i}>
                        <KeyBadge>{key}</KeyBadge>
                        {i < shortcut.keys.length - 1 && (
                          <span className="text-muted-foreground/50 text-xs mx-0.5">+</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
