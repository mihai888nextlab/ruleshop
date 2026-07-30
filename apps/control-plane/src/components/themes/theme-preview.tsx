"use client";

import {
  BODY_FONTS,
  DISPLAY_FONTS,
  themeToCssVars,
  type ThemeTokens,
} from "@ruleshop/contracts";

/**
 * Miniature of the storefront under a set of tokens.
 *
 * Deliberately built from the same CSS variables the shop reads, so the preview
 * cannot drift from reality by being styled independently. It shows the pieces a
 * theme actually affects: headings, body text, a surface, an accent button,
 * borders, and the discount and warning colours.
 *
 * The font variables resolve differently here than in the shop — the control
 * plane loads its own faces — so the family is named explicitly for the preview
 * while colour, shape and rhythm come straight from the tokens.
 */
export function ThemePreview({
  tokens,
  storeName,
}: {
  tokens: ThemeTokens;
  storeName: string;
}) {
  const vars = themeToCssVars(tokens);

  const style = {
    ...vars,
    // Override the variable references with concrete families, since the shop's
    // font variables are not defined in this app.
    "--font-display": `"${DISPLAY_FONTS[tokens.fontDisplay]}", Georgia, serif`,
    "--font-body": `"${BODY_FONTS[tokens.fontBody]}", system-ui, sans-serif`,
  } as React.CSSProperties;

  const gap = tokens.density === "compact" ? 10 : tokens.density === "airy" ? 22 : 16;

  return (
    <div
      style={style}
      className="overflow-hidden border border-[var(--border)]"
    >
      <div
        style={{
          background: "var(--bg)",
          color: "var(--fg)",
          fontFamily: "var(--font-body)",
        }}
      >
        <header
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: "var(--border)" }}
        >
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: tokens.displayWeight,
              letterSpacing: `${tokens.displayTracking}em`,
              fontSize: "1.1rem",
            }}
          >
            {storeName}
          </span>
          <span style={{ color: "var(--muted)", fontSize: "0.7rem" }}>
            Coș (2)
          </span>
        </header>

        <div style={{ padding: gap, display: "grid", gap }}>
          <div>
            <p
              style={{
                color: "var(--muted)",
                fontSize: "0.65rem",
                textTransform: "uppercase",
                letterSpacing: "0.14em",
              }}
            >
              Colecție
            </p>
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: tokens.displayWeight,
                letterSpacing: `${tokens.displayTracking}em`,
                fontSize: "2rem",
                lineHeight: 1.05,
                marginTop: 4,
              }}
            >
              Palton din lână
            </h2>
            <p
              style={{
                color: "var(--muted)",
                fontSize: "0.8rem",
                marginTop: 6,
              }}
            >
              Prețul este decis de rule engine pentru fiecare client.
            </p>
          </div>

          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: gap * 0.75,
              display: "grid",
              gap: gap * 0.5,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 8,
              }}
            >
              <span style={{ fontSize: "1.15rem" }}>719,20 RON</span>
              <span
                style={{
                  color: "var(--muted)",
                  textDecoration: "line-through",
                  fontSize: "0.8rem",
                }}
              >
                899,00 RON
              </span>
              <span style={{ color: "var(--positive)", fontSize: "0.8rem" }}>
                −20%
              </span>
            </div>

            <p style={{ color: "var(--muted)", fontSize: "0.7rem" }}>
              cluj-loyal-local · vip-discount
            </p>

            <button
              type="button"
              tabIndex={-1}
              style={{
                background: "var(--accent)",
                color: "var(--accent-fg)",
                borderRadius: "var(--radius)",
                padding: "8px 14px",
                fontSize: "0.8rem",
                border: "1px solid var(--accent)",
                cursor: "default",
                width: "fit-content",
              }}
            >
              Adaugă în coș
            </button>
          </div>

          <div
            style={{
              background: "var(--surface-2)",
              borderRadius: "var(--radius)",
              padding: gap * 0.6,
              display: "grid",
              gap: 4,
            }}
          >
            <span style={{ fontSize: "0.75rem" }}>Livrare gratuită</span>
            <span style={{ color: "var(--warning)", fontSize: "0.7rem" }}>
              Stoc limitat
            </span>
            <span style={{ color: "var(--danger)", fontSize: "0.7rem" }}>
              Indisponibil în acest oraș
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
