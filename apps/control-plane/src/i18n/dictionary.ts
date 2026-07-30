import type { Locale } from "./config";
import { defaultLocale } from "./config";
import en from "./messages/en.json";
import ro from "./messages/ro.json";

export type Messages = typeof ro;

const catalogs: Record<Locale, Messages> = { ro, en };

type NestedValue = string | { [key: string]: NestedValue };

function lookup(messages: NestedValue, path: string): string | undefined {
  const parts = path.split(".");
  let cur: NestedValue | undefined = messages;
  for (const part of parts) {
    if (cur == null || typeof cur === "string") return undefined;
    cur = cur[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

export type TranslateFn = (
  key: string,
  params?: Record<string, string | number>,
) => string;

export function createTranslator(locale: Locale = defaultLocale): TranslateFn {
  const primary = catalogs[locale] ?? catalogs[defaultLocale];
  const fallback = catalogs[defaultLocale];

  return (key, params) => {
    let text =
      lookup(primary as NestedValue, key) ??
      lookup(fallback as NestedValue, key) ??
      key;
    if (params) {
      for (const [name, value] of Object.entries(params)) {
        text = text.replaceAll(`{${name}}`, String(value));
      }
    }
    return text;
  };
}

export function getMessages(locale: Locale): Messages {
  return catalogs[locale] ?? catalogs[defaultLocale];
}
