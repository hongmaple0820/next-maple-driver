"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Clock,
  Image as ImageIcon,
  Film,
  Music,
  FileText,
  FileCode,
  Archive,
  Calendar,
  HardDrive,
  X,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export interface SuggestionItem {
  id: string;
  type: "recent" | "type" | "date" | "size" | "query";
  label: string;
  icon?: React.ReactNode;
  value: string;
  filterKey?: string; // e.g., "type", "date", "size"
}

const RECENT_SEARCHES_KEY = "clouddrive-recent-searches";
const MAX_RECENT = 8;

function getRecentSearches(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function addRecentSearch(query: string) {
  try {
    const recent = getRecentSearches().filter((s) => s !== query);
    recent.unshift(query);
    localStorage.setItem(
      RECENT_SEARCHES_KEY,
      JSON.stringify(recent.slice(0, MAX_RECENT))
    );
  } catch {
    // silent
  }
}

function removeRecentSearch(query: string) {
  try {
    const recent = getRecentSearches().filter((s) => s !== query);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recent));
  } catch {
    // silent
  }
}

function clearRecentSearches() {
  try {
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch {
    // silent
  }
}

interface SearchSuggestionsProps {
  query: string;
  visible: boolean;
  onSelect: (item: SuggestionItem) => void;
  onClose: () => void;
}

export function SearchSuggestions({
  query,
  visible,
  onSelect,
  onClose,
}: SearchSuggestionsProps) {
  const { t } = useI18n();
  const [recentKey, setRecentKey] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Read recent searches fresh from localStorage each render (cheap synchronous read)
  const recentSearches = getRecentSearches();

  // Reset selection and refresh recent when dropdown becomes visible
  useEffect(() => {
    if (visible) {
      requestAnimationFrame(() => {
        setSelectedIndex(-1);
        setRecentKey((k) => k + 1);
      });
    }
  }, [visible]);

  // Build suggestions based on query
  const suggestions = useCallback((): SuggestionItem[] => {
    const items: SuggestionItem[] = [];

    // If no query, show recent searches + quick filters
    if (!query.trim()) {
      // Recent searches
      recentSearches.forEach((s, i) => {
        items.push({
          id: `recent-${i}`,
          type: "recent",
          label: s,
          icon: <Clock className="w-3.5 h-3.5 text-muted-foreground" />,
          value: s,
        });
      });

      // Quick type filters
      const typeFilters: Array<{
        id: string;
        label: string;
        icon: React.ReactNode;
      }> = [
        {
          id: "images",
          label: t.app.filterImages,
          icon: <ImageIcon className="w-3.5 h-3.5 text-emerald-500" />,
        },
        {
          id: "videos",
          label: t.app.filterVideos,
          icon: <Film className="w-3.5 h-3.5 text-rose-500" />,
        },
        {
          id: "audio",
          label: t.app.filterAudio,
          icon: <Music className="w-3.5 h-3.5 text-purple-500" />,
        },
        {
          id: "documents",
          label: t.app.filterDocs,
          icon: <FileText className="w-3.5 h-3.5 text-sky-500" />,
        },
        {
          id: "code",
          label: t.app.filterCode,
          icon: <FileCode className="w-3.5 h-3.5 text-amber-500" />,
        },
        {
          id: "archives",
          label: t.app.filterArchives,
          icon: <Archive className="w-3.5 h-3.5 text-orange-500" />,
        },
      ];

      typeFilters.forEach((tf) => {
        items.push({
          id: `type-${tf.id}`,
          type: "type",
          label: tf.label,
          icon: tf.icon,
          value: tf.id,
          filterKey: "type",
        });
      });

      // Quick date filters
      const dateFilters: Array<{
        id: string;
        label: string;
        icon: React.ReactNode;
      }> = [
        {
          id: "today",
          label: t.app.searchToday,
          icon: <Calendar className="w-3.5 h-3.5 text-muted-foreground" />,
        },
        {
          id: "week",
          label: t.app.searchThisWeek,
          icon: <Calendar className="w-3.5 h-3.5 text-muted-foreground" />,
        },
        {
          id: "month",
          label: t.app.searchThisMonth,
          icon: <Calendar className="w-3.5 h-3.5 text-muted-foreground" />,
        },
      ];

      dateFilters.forEach((df) => {
        items.push({
          id: `date-${df.id}`,
          type: "date",
          label: df.label,
          icon: df.icon,
          value: df.id,
          filterKey: "date",
        });
      });

      // Quick size filters
      const sizeFilters: Array<{
        id: string;
        label: string;
        icon: React.ReactNode;
      }> = [
        {
          id: "small",
          label: t.app.searchSmallFiles,
          icon: <HardDrive className="w-3.5 h-3.5 text-muted-foreground" />,
        },
        {
          id: "large",
          label: t.app.searchLargeFiles,
          icon: <HardDrive className="w-3.5 h-3.5 text-muted-foreground" />,
        },
      ];

      sizeFilters.forEach((sf) => {
        items.push({
          id: `size-${sf.id}`,
          type: "size",
          label: sf.label,
          icon: sf.icon,
          value: sf.id,
          filterKey: "size",
        });
      });

      return items;
    }

    // With query: show matching suggestions
    const q = query.trim().toLowerCase();

    // Suggest the query itself as a search
    items.push({
      id: "query-exact",
      type: "query",
      label: query.trim(),
      icon: <Search className="w-3.5 h-3.5 text-emerald-500" />,
      value: query.trim(),
    });

    // Suggested type filters based on query
    const typeHints: Record<string, { type: string; label: string; icon: React.ReactNode }> = {
      photo: { type: "images", label: t.app.filterImages, icon: <ImageIcon className="w-3.5 h-3.5 text-emerald-500" /> },
      image: { type: "images", label: t.app.filterImages, icon: <ImageIcon className="w-3.5 h-3.5 text-emerald-500" /> },
      picture: { type: "images", label: t.app.filterImages, icon: <ImageIcon className="w-3.5 h-3.5 text-emerald-500" /> },
      screenshot: { type: "images", label: t.app.filterImages, icon: <ImageIcon className="w-3.5 h-3.5 text-emerald-500" /> },
      video: { type: "videos", label: t.app.filterVideos, icon: <Film className="w-3.5 h-3.5 text-rose-500" /> },
      movie: { type: "videos", label: t.app.filterVideos, icon: <Film className="w-3.5 h-3.5 text-rose-500" /> },
      music: { type: "audio", label: t.app.filterAudio, icon: <Music className="w-3.5 h-3.5 text-purple-500" /> },
      song: { type: "audio", label: t.app.filterAudio, icon: <Music className="w-3.5 h-3.5 text-purple-500" /> },
      audio: { type: "audio", label: t.app.filterAudio, icon: <Music className="w-3.5 h-3.5 text-purple-500" /> },
      doc: { type: "documents", label: t.app.filterDocs, icon: <FileText className="w-3.5 h-3.5 text-sky-500" /> },
      pdf: { type: "documents", label: t.app.filterDocs, icon: <FileText className="w-3.5 h-3.5 text-sky-500" /> },
      code: { type: "code", label: t.app.filterCode, icon: <FileCode className="w-3.5 h-3.5 text-amber-500" /> },
      script: { type: "code", label: t.app.filterCode, icon: <FileCode className="w-3.5 h-3.5 text-amber-500" /> },
      zip: { type: "archives", label: t.app.filterArchives, icon: <Archive className="w-3.5 h-3.5 text-orange-500" /> },
      archive: { type: "archives", label: t.app.filterArchives, icon: <Archive className="w-3.5 h-3.5 text-orange-500" /> },
    };

    // Find matching type hints
    for (const [keyword, hint] of Object.entries(typeHints)) {
      if (q.includes(keyword)) {
        items.push({
          id: `type-hint-${hint.type}`,
          type: "type",
          label: `${query.trim()} + ${hint.label}`,
          icon: hint.icon,
          value: hint.type,
          filterKey: "type",
        });
        break; // Only add one type hint
      }
    }

    // Matching recent searches
    recentSearches
      .filter((s) => s.toLowerCase().includes(q) && s.toLowerCase() !== q)
      .slice(0, 3)
      .forEach((s, i) => {
        items.push({
          id: `recent-match-${i}`,
          type: "recent",
          label: s,
          icon: <Clock className="w-3.5 h-3.5 text-muted-foreground" />,
          value: s,
        });
      });

    return items;
  }, [query, recentSearches, t]);

  const items = suggestions();

  // Keyboard navigation
  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, items.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, -1));
      } else if (e.key === "Enter" && selectedIndex >= 0) {
        e.preventDefault();
        const item = items[selectedIndex];
        if (item) {
          if (item.type === "recent" || item.type === "query") {
            addRecentSearch(item.value);
          }
          onSelect(item);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [visible, items, selectedIndex, onSelect, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && containerRef.current) {
      const selectedEl = containerRef.current.querySelector(
        `[data-suggestion-index="${selectedIndex}"]`
      );
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex]);

  const handleClick = (item: SuggestionItem, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (item.type === "recent" || item.type === "query") {
      addRecentSearch(item.value);
    }
    onSelect(item);
  };

  const handleRemoveRecent = (query: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    removeRecentSearch(query);
    setRecentKey((k) => k + 1);
  };

  const handleClearRecent = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    clearRecentSearches();
    setRecentKey((k) => k + 1);
  };

  // Group items by type for display
  const recentItems = items.filter((i) => i.type === "recent");
  const typeItems = items.filter((i) => i.type === "type");
  const dateItems = items.filter((i) => i.type === "date");
  const sizeItems = items.filter((i) => i.type === "size");
  const queryItems = items.filter((i) => i.type === "query");

  const getItemIndex = (item: SuggestionItem) => items.indexOf(item);

  return (
    <AnimatePresence>
      {visible && items.length > 0 && (
        <motion.div
          ref={containerRef}
          initial={{ opacity: 0, y: -4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.98 }}
          transition={{ duration: 0.15 }}
          className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg z-50 overflow-hidden"
        >
          <div className="max-h-80 overflow-y-auto custom-scrollbar">
            {/* Query suggestions */}
            {queryItems.length > 0 && (
              <div className="py-1">
                {queryItems.map((item) => {
                  const idx = getItemIndex(item);
                  return (
                    <button
                      key={item.id}
                      data-suggestion-index={idx}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors",
                        idx === selectedIndex
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent/50"
                      )}
                      onClick={(e) => handleClick(item, e)}
                    >
                      {item.icon}
                      <span className="flex-1 truncate">
                        {t.app.searchFor} &ldquo;<span className="font-medium">{item.label}</span>&rdquo;
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Recent searches */}
            {recentItems.length > 0 && (
              <div className="py-1">
                <div className="flex items-center justify-between px-3 py-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    {t.app.recentSearches}
                  </span>
                  <button
                    onClick={handleClearRecent}
                    className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t.app.clearAll}
                  </button>
                </div>
                {recentItems.map((item) => {
                  const idx = getItemIndex(item);
                  return (
                    <button
                      key={item.id}
                      data-suggestion-index={idx}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors group",
                        idx === selectedIndex
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent/50"
                      )}
                      onClick={(e) => handleClick(item, e)}
                    >
                      <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate">{item.label}</span>
                      <button
                        onClick={(e) => handleRemoveRecent(item.value, e)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-foreground transition-all"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Type filters */}
            {typeItems.length > 0 && (
              <div className="py-1 border-t border-border/50">
                <div className="px-3 py-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    {t.app.filterByType}
                  </span>
                </div>
                <div className="px-2 pb-1 flex flex-wrap gap-1">
                  {typeItems.map((item) => {
                    const idx = getItemIndex(item);
                    return (
                      <button
                        key={item.id}
                        data-suggestion-index={idx}
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all",
                          idx === selectedIndex
                            ? "bg-accent text-accent-foreground"
                            : "bg-muted/50 hover:bg-accent/50"
                        )}
                        onClick={(e) => handleClick(item, e)}
                      >
                        {item.icon}
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Date filters */}
            {dateItems.length > 0 && (
              <div className="py-1 border-t border-border/50">
                <div className="px-3 py-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    {t.app.filterByDate}
                  </span>
                </div>
                <div className="px-2 pb-1 flex flex-wrap gap-1">
                  {dateItems.map((item) => {
                    const idx = getItemIndex(item);
                    return (
                      <button
                        key={item.id}
                        data-suggestion-index={idx}
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all",
                          idx === selectedIndex
                            ? "bg-accent text-accent-foreground"
                            : "bg-muted/50 hover:bg-accent/50"
                        )}
                        onClick={(e) => handleClick(item, e)}
                      >
                        {item.icon}
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Size filters */}
            {sizeItems.length > 0 && (
              <div className="py-1 border-t border-border/50">
                <div className="px-3 py-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    {t.app.filterBySize}
                  </span>
                </div>
                <div className="px-2 pb-1 flex flex-wrap gap-1">
                  {sizeItems.map((item) => {
                    const idx = getItemIndex(item);
                    return (
                      <button
                        key={item.id}
                        data-suggestion-index={idx}
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all",
                          idx === selectedIndex
                            ? "bg-accent text-accent-foreground"
                            : "bg-muted/50 hover:bg-accent/50"
                        )}
                        onClick={(e) => handleClick(item, e)}
                      >
                        {item.icon}
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export { addRecentSearch, clearRecentSearches };
