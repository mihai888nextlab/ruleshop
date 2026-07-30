"use server";

import { cookies } from "next/headers";
import { LOCALE_COOKIE, isLocale, type Locale } from "@/i18n/config";

export async function setLocaleAction(locale: Locale) {
  if (!isLocale(locale)) return;
  const jar = await cookies();
  jar.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
