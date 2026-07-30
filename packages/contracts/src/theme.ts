import { z } from "zod";

/**
 * Theme tokens.
 *
 * A theme is data, not code: an administrator composes one, a published rule
 * selects it by key, and the storefront applies the values as CSS custom
 * properties. Nothing about a theme requires a deploy.
 *
 * That means theme values cross a trust boundary — they are authored in the
 * control plane and injected into a style attribute in the shop. Every field
 * here is therefore constrained to a shape that cannot carry CSS: colours must
 * be hex literals, fonts must name one of a fixed set the storefront has already
 * loaded, and the remaining values are bounded numbers. A free-text colour would
 * be a stylesheet injection.
 */

/** Hex only. `red`, `var(--x)` and `url(...)` are all rejected by construction. */
export const hexColorSchema = z
  .string()
  .trim()
  .regex(
    /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
    "culoarea trebuie să fie hex, ex. #1a2b3c",
  );

/**
 * Fonts the storefront bundles.
 *
 * Keys, not family names: the shop loads these at build time and exposes each as
 * a CSS variable, so a theme can only select from what is actually available.
 * Arbitrary font names would either fail silently or invite a remote request.
 */
export const DISPLAY_FONTS = {
  syne: "Syne",
  fraunces: "Fraunces",
  playfair: "Playfair Display",
  spaceGrotesk: "Space Grotesk",
} as const;

export const BODY_FONTS = {
  figtree: "Figtree",
  inter: "Inter",
  lora: "Lora",
} as const;

export type DisplayFontKey = keyof typeof DISPLAY_FONTS;
export type BodyFontKey = keyof typeof BODY_FONTS;

export const displayFontSchema = z.enum(
  Object.keys(DISPLAY_FONTS) as [DisplayFontKey, ...DisplayFontKey[]],
);
export const bodyFontSchema = z.enum(
  Object.keys(BODY_FONTS) as [BodyFontKey, ...BodyFontKey[]],
);

/** Colour roles. Every storefront component reads these and nothing else. */
export const themeColorsSchema = z.object({
  bg: hexColorSchema,
  /** Gradient base the page background fades toward. */
  bgDeep: hexColorSchema,
  fg: hexColorSchema,
  muted: hexColorSchema,
  surface: hexColorSchema,
  surface2: hexColorSchema,
  border: hexColorSchema,
  /** Hairlines and dividers, which are often not the same as body text. */
  rule: hexColorSchema,
  accent: hexColorSchema,
  accentFg: hexColorSchema,
  positive: hexColorSchema,
  warning: hexColorSchema,
  danger: hexColorSchema,
});

export type ThemeColors = z.infer<typeof themeColorsSchema>;

export const COLOR_LABELS: Record<keyof ThemeColors, string> = {
  bg: "Fundal pagină",
  bgDeep: "Fundal profund (degrade)",
  fg: "Text principal",
  muted: "Text secundar",
  surface: "Suprafață (card)",
  surface2: "Suprafață alternativă",
  border: "Contur / linii",
  rule: "Linii de separare",
  accent: "Accent (butoane)",
  accentFg: "Text pe accent",
  positive: "Reducere / succes",
  warning: "Avertisment",
  danger: "Eroare / indisponibil",
};

export const themeTokensSchema = z.object({
  colors: themeColorsSchema,
  fontDisplay: displayFontSchema,
  fontBody: bodyFontSchema,
  /** Corner rounding in pixels. 0 reads as severe, 16 as soft. */
  radius: z.number().int().min(0).max(24),
  /** Display letter-spacing in em. Negative tightens large headings. */
  displayTracking: z.number().min(-0.06).max(0.12),
  /** Display weight, for the faces that support a range. */
  displayWeight: z.number().int().min(300).max(900),
  /** Page rhythm: how generous the vertical spacing feels. */
  density: z.enum(["compact", "regular", "airy"]),
  /** Aspect ratio for product imagery. */
  productRatio: z.enum(["3 / 4", "1 / 1", "4 / 5"]),
  /** How strongly hero imagery is darkened, 0 to 1. */
  heroOverlay: z.number().min(0).max(1),
});

export type ThemeTokens = z.infer<typeof themeTokensSchema>;

/** A theme as stored in a store's library. */
export const storeThemeSchema = z.object({
  key: z.string(),
  name: z.string(),
  tokens: themeTokensSchema,
  isDefault: z.boolean(),
});

export type StoreTheme = z.infer<typeof storeThemeSchema>;

export const themeKeySchema = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(
    /^[a-z][a-z0-9-]*$/,
    "cheia trebuie să înceapă cu o literă și să conțină doar litere mici, cifre și -",
  );

export const themeInputSchema = z.object({
  key: themeKeySchema,
  name: z.string().trim().min(1).max(60),
  tokens: themeTokensSchema,
});

/**
 * Fallback used when a store has no themes, or when a rule names one that has
 * since been deleted. A shop must always render.
 */
export const DEFAULT_THEME_TOKENS: ThemeTokens = {
  colors: {
    bg: "#eef0ee",
    bgDeep: "#e2e6e2",
    fg: "#121512",
    muted: "#5f6661",
    surface: "#f8f9f7",
    surface2: "#dfe3df",
    border: "#c8cec8",
    rule: "#121512",
    accent: "#121512",
    accentFg: "#f4f6f4",
    positive: "#2a5a42",
    warning: "#8a5a12",
    danger: "#8f2c2c",
  },
  // Matches the storefront's own default look, so an unstyled store and the
  // fallback theme are the same thing rather than two slightly different ones.
  fontDisplay: "syne",
  fontBody: "figtree",
  radius: 0,
  displayTracking: -0.04,
  displayWeight: 600,
  density: "regular",
  productRatio: "3 / 4",
  heroOverlay: 0.72,
};

const DENSITY_SCALE: Record<ThemeTokens["density"], string> = {
  compact: "0.8",
  regular: "1",
  airy: "1.25",
};

/**
 * Converts tokens into the CSS custom properties the storefront reads.
 *
 * Returned as a plain object for a React `style` prop rather than a string, so
 * values are set as properties and can never be read as declarations. Combined
 * with the schema above, a theme cannot introduce CSS.
 */
/** Expands `#abc` and returns the channels of a validated hex colour. */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const raw = hex.replace("#", "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;

  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** Perceived brightness, 0 (black) to 1 (white). */
function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * Builds the hero scrim.
 *
 * Hero text is always light, so the scrim has to be dark whatever the theme —
 * deriving it from the background would produce a light wash over a photo and
 * white text on top of it. Taking the darker of the theme's own deep background
 * and its foreground gives a dark tone in both light and dark themes while still
 * belonging to the palette.
 *
 * The gradient is assembled here from validated hex values plus fixed stops
 * rather than being authored, because a free-text gradient is the one field in a
 * theme that could otherwise carry arbitrary CSS.
 */
function heroOverlayGradient(
  bgDeep: string,
  fg: string,
  strength: number,
): string {
  const hex = luminance(bgDeep) <= luminance(fg) ? bgDeep : fg;
  const { r, g, b } = hexToRgb(hex);
  const top = Math.min(1, strength);
  const mid = Math.min(1, strength * 0.55);
  const end = Math.min(1, strength * 0.15);

  return (
    `linear-gradient(105deg, ` +
    `rgba(${r}, ${g}, ${b}, ${top.toFixed(2)}) 0%, ` +
    `rgba(${r}, ${g}, ${b}, ${mid.toFixed(2)}) 48%, ` +
    `rgba(${r}, ${g}, ${b}, ${end.toFixed(2)}) 100%)`
  );
}

export function themeToCssVars(tokens: ThemeTokens): Record<string, string> {
  return {
    "--bg": tokens.colors.bg,
    "--bg-deep": tokens.colors.bgDeep,
    "--fg": tokens.colors.fg,
    "--muted": tokens.colors.muted,
    "--surface": tokens.colors.surface,
    "--surface-2": tokens.colors.surface2,
    "--border": tokens.colors.border,
    "--rule": tokens.colors.rule,
    "--accent": tokens.colors.accent,
    "--accent-fg": tokens.colors.accentFg,
    "--positive": tokens.colors.positive,
    "--warning": tokens.colors.warning,
    "--danger": tokens.colors.danger,
    "--radius": `${tokens.radius}px`,
    "--display-tracking": `${tokens.displayTracking}em`,
    "--display-weight": String(tokens.displayWeight),
    "--density": DENSITY_SCALE[tokens.density],
    "--product-ratio": tokens.productRatio,
    "--hero-overlay": heroOverlayGradient(
      tokens.colors.bgDeep,
      tokens.colors.fg,
      tokens.heroOverlay,
    ),
    // Points at a variable the storefront defined when it loaded the font, so
    // the value here is a reference to a known font rather than a family name.
    "--font-display": `var(--font-${tokens.fontDisplay})`,
    "--font-body": `var(--font-${tokens.fontBody})`,
  };
}

/** Theme delivered with every storefront read, already resolved. */
export const resolvedThemeSchema = z.object({
  /** Key the rules selected, or null when no rule expressed a preference. */
  key: z.string().nullable(),
  name: z.string(),
  tokens: themeTokensSchema,
  /**
   * True when a rule named a theme that does not exist, so the UI can surface a
   * misconfiguration instead of silently showing defaults.
   */
  fallback: z.boolean(),
});

export type ResolvedTheme = z.infer<typeof resolvedThemeSchema>;
