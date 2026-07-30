export const locales = ["ro", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "ro";
export const LOCALE_COOKIE = "ruleshop_locale";

export function isLocale(value: string | undefined | null): value is Locale {
  return value === "ro" || value === "en";
}
