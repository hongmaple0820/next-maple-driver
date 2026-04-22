"use client";

import { useI18n, type Locale } from "@/lib/i18n";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const languages: { code: Locale; label: string; flag: string }[] = [
  { code: "zh", label: "中文", flag: "\u{1F1E8}\u{1F1F3}" },
  { code: "en", label: "English", flag: "\u{1F1FA}\u{1F1F8}" },
];

export function LanguageSwitcher({
  variant = "default",
}: {
  variant?: "default" | "compact" | "ghost";
}) {
  const { locale, setLocale } = useI18n();
  const currentLang = languages.find((l) => l.code === locale);

  if (variant === "ghost") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 h-8 px-2 text-xs"
          >
            <Globe className="w-3.5 h-3.5" />
            {currentLang?.flag}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {languages.map((lang) => (
            <DropdownMenuItem
              key={lang.code}
              onClick={() => setLocale(lang.code)}
              className={locale === lang.code ? "bg-accent" : ""}
            >
              <span className="mr-2">{lang.flag}</span>
              {lang.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size={variant === "compact" ? "sm" : "default"}
          className="gap-2"
        >
          <Globe className="w-4 h-4" />
          <span>
            {currentLang?.flag} {currentLang?.label}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {languages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => setLocale(lang.code)}
            className={locale === lang.code ? "bg-accent" : ""}
          >
            <span className="mr-2">{lang.flag}</span>
            {lang.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
