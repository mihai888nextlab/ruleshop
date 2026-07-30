import { cookies } from "next/headers";
import {
  LOCALE_COOKIE,
  defaultLocale,
  isLocale,
  type Locale,
} from "./config";
import { createTranslator, type TranslateFn } from "./dictionary";

export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  const raw = jar.get(LOCALE_COOKIE)?.value;
  return isLocale(raw) ? raw : defaultLocale;
}

export async function getTranslator(): Promise<TranslateFn> {
  return createTranslator(await getLocale());
}
