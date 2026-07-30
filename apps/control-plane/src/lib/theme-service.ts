import {
  DEFAULT_THEME_TOKENS,
  themeTokensSchema,
  type ResolvedTheme,
  type ThemeTokens,
} from "@ruleshop/contracts";
import { prisma } from "./prisma";

/**
 * Resolves the theme a request should render with.
 *
 * The engine's `setTheme` action only names a key; the tokens live in the store's
 * own theme library. Keeping the two apart is what lets an administrator restyle
 * a shop without touching a rule, and lets a rule retarget a look without
 * touching the design.
 */

/**
 * Reads a stored token blob.
 *
 * Tokens are validated on write, so a parse failure here means the column was
 * changed by something other than this application. Falling back to defaults
 * keeps the shop rendering rather than failing the whole page over styling.
 */
export function parseTokens(raw: unknown): ThemeTokens {
  const parsed = themeTokensSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_THEME_TOKENS;
}

export async function listThemes(storeId: string) {
  return prisma.theme.findMany({
    where: { storeId },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
}

export async function themeKeysFor(storeId: string): Promise<string[]> {
  const rows = await prisma.theme.findMany({
    where: { storeId },
    select: { key: true },
    orderBy: { key: "asc" },
  });
  return rows.map((row) => row.key);
}

/**
 * Turns a decided theme key into tokens.
 *
 * `fallback` is set when a rule named a theme that no longer exists. That is a
 * misconfiguration worth surfacing rather than hiding behind defaults — the shop
 * still renders, and the control plane can show that a rule points at nothing.
 */
export async function resolveTheme(
  storeId: string,
  decidedKey: unknown,
): Promise<ResolvedTheme> {
  const key = typeof decidedKey === "string" && decidedKey ? decidedKey : null;

  if (key) {
    const theme = await prisma.theme.findUnique({
      where: { storeId_key: { storeId, key } },
    });
    if (theme) {
      return {
        key: theme.key,
        name: theme.name,
        tokens: parseTokens(theme.tokens),
        fallback: false,
      };
    }
  }

  const fallbackTheme = await prisma.theme.findFirst({
    where: { storeId, isDefault: true },
  });

  if (fallbackTheme) {
    return {
      key: fallbackTheme.key,
      name: fallbackTheme.name,
      tokens: parseTokens(fallbackTheme.tokens),
      // A rule asked for something specific and did not get it.
      fallback: key !== null,
    };
  }

  return {
    key: null,
    name: "Implicit",
    tokens: DEFAULT_THEME_TOKENS,
    fallback: key !== null,
  };
}
