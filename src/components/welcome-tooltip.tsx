"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X } from "lucide-react";

const WELCOME_SHOWN_KEY = "clouddrive-welcome-shown";

export function WelcomeTooltip() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Only show if never shown before
    const hasShown = localStorage.getItem(WELCOME_SHOWN_KEY);
    if (!hasShown) {
      // Small delay to let the UI render
      const timer = setTimeout(() => setShow(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem(WELCOME_SHOWN_KEY, "true");
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.95 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="absolute left-0 top-full mt-2 z-50"
        >
          <div className="relative bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-500/25 px-4 py-3 max-w-[260px]">
            {/* Arrow */}
            <div className="absolute -top-2 left-6 w-4 h-4 rotate-45 bg-emerald-600 rounded-sm" />

            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 shrink-0 mt-0.5 text-emerald-200" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-tight">
                  Start by uploading your first file!
                </p>
                <p className="text-xs text-emerald-100/70 mt-1">
                  Click the Upload button or drag &amp; drop files anywhere.
                </p>
              </div>
              <button
                onClick={handleDismiss}
                className="shrink-0 text-emerald-200 hover:text-white transition-colors -mt-0.5 -mr-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
