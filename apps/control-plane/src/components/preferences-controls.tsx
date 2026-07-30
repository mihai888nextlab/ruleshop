"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

/**
 * Theme + language switches for the control plane chrome.
 */
export function PreferencesControls({
  className,
  compact,
}: {
  className?: string;
  /** Dark sidebar styling */
  compact?: boolean;
}) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { locale, setLocale, t, pending } = useI18n();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const btn = compact
    ? "rounded px-1.5 py-0.5 text-[11px] transition-colors"
    : "rounded-[var(--radius)] border px-2 py-1 text-xs transition-colors";

  const idle = compact
    ? "text-[var(--sidebar-muted)] hover:text-[var(--sidebar-fg)]"
    : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]";

  const active = compact
    ? "bg-white/10 text-[var(--sidebar-fg)]"
    : "border-[var(--fg)] bg-[var(--fg)] text-[var(--accent-fg)]";

  const currentTheme = mounted ? (theme ?? "system") : "system";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2",
        compact && "flex-col items-stretch gap-2",
        className,
      )}
      role="group"
      aria-label={`${t("common.theme")} / ${t("common.language")}`}
    >
      <div className={cn("flex gap-0.5", compact && "justify-between")}>
        {(
          [
            ["light", "common.themeLight"],
            ["dark", "common.themeDark"],
            ["system", "common.themeSystem"],
          ] as const
        ).map(([value, labelKey]) => (
          <button
            key={value}
            type="button"
            className={cn(btn, currentTheme === value ? active : idle)}
            aria-pressed={currentTheme === value}
            title={
              value === "system" && mounted
                ? `${t(labelKey)} (${resolvedTheme})`
                : t(labelKey)
            }
            onClick={() => setTheme(value)}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      <div className={cn("flex gap-0.5", compact && "justify-between")}>
        {(["ro", "en"] as Locale[]).map((code) => (
          <button
            key={code}
            type="button"
            disabled={pending}
            className={cn(btn, locale === code ? active : idle)}
            aria-pressed={locale === code}
            onClick={() => setLocale(code)}
          >
            {code === "ro" ? t("common.localeRo") : t("common.localeEn")}
          </button>
        ))}
      </div>
    </div>
  );
}
