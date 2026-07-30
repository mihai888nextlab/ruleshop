import type { ThemeTokens } from "./types";

const DENSITY_SCALE: Record<ThemeTokens["density"], string> = {
  compact: "0.8",
  regular: "1",
  airy: "1.25",
};

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

function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

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
    "--font-display": `var(--font-${tokens.fontDisplay})`,
    "--font-body": `var(--font-${tokens.fontBody})`,
  };
}
