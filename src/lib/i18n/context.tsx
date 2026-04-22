"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { translations, type Locale, type TranslationKeys } from "./translations";

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TranslationKeys;
}

const I18nContext = createContext<I18nContextType>({
  locale: "zh",
  setLocale: () => {},
  t: translations.zh,
});

function getInitialLocale(): Locale {
  if (typeof window === "undefined") return "zh";
  const stored = localStorage.getItem("clouddrive-locale") as Locale | null;
  if (stored && (stored === "zh" || stored === "en")) return stored;
  const browserLang = navigator.language.toLowerCase();
  return browserLang.startsWith("zh") ? "zh" : "en";
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("zh");
  const [mounted, setMounted] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const initialLocale = getInitialLocale();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocaleState(initialLocale);
    setMounted(true);
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem("clouddrive-locale", newLocale);
  }, []);

  const t = useMemo(() => translations[locale], [locale]);

  // Prevent hydration mismatch by using default translations until mounted
  const value = useMemo(
    () => ({
      locale: mounted ? locale : "zh",
      setLocale,
      t: mounted ? t : translations.zh,
    }),
    [locale, setLocale, t, mounted]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

export type { Locale };
