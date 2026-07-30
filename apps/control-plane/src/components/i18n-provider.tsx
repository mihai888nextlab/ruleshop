"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { setLocaleAction } from "@/app/actions/locale";
import type { Locale } from "@/i18n/config";
import { createTranslator, type TranslateFn } from "@/i18n/dictionary";

type I18nContextValue = {
  locale: Locale;
  t: TranslateFn;
  setLocale: (locale: Locale) => void;
  pending: boolean;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const t = useMemo(() => createTranslator(locale), [locale]);

  const setLocale = useCallback(
    (next: Locale) => {
      startTransition(async () => {
        await setLocaleAction(next);
        router.refresh();
      });
    },
    [router],
  );

  const value = useMemo(
    () => ({ locale, t, setLocale, pending }),
    [locale, t, setLocale, pending],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

export function useT(): TranslateFn {
  return useI18n().t;
}
