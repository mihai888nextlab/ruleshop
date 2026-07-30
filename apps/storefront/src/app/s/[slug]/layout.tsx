import Link from "next/link";
import { notFound } from "next/navigation";
import { signOut } from "@/app/actions";
import { themeToCssVars } from "@ruleshop/contracts";
import { getCart } from "@/lib/api";
import { hasSession } from "@/lib/session";

/**
 * Store shell.
 *
 * The cart read supplies both the item count and the theme decision, so the
 * shell restyles from the same request that fills the header — one round trip
 * rather than two.
 *
 * `data-theme` is the whole mechanism by which a published rule changes the
 * shop's appearance. No component reads the theme; they all read tokens.
 */
export default async function StoreLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [cart, signedIn] = await Promise.all([getCart(slug), hasSession()]);

  if (!cart.ok && cart.status === 404) notFound();

  const themeId = cart.ok ? cart.data.store.theme.themeId : "default";

  /**
   * A theme composed in the control plane arrives as token values, which are
   * applied as inline custom properties. `data-theme` stays as the fallback for
   * built-in looks, so a store with no themes defined still renders.
   *
   * Applying tokens inline is safe because every one is schema-constrained to a
   * hex literal, a bounded number, or a reference to a font this app loaded — a
   * theme cannot introduce a declaration.
   */
  const resolvedTheme = cart.ok ? cart.data.store.theme.resolved : null;
  const themeVars = resolvedTheme
    ? (themeToCssVars(resolvedTheme.tokens) as React.CSSProperties)
    : undefined;
  const storeName = cart.ok ? cart.data.store.name : slug;
  const itemCount = cart.ok
    ? cart.data.lines.reduce((n, line) => n + line.quantity, 0)
    : 0;

  return (
    <div
      data-theme={themeId}
      style={themeVars}
      className="flex min-h-screen flex-col"
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-[var(--surface)] focus:px-3 focus:py-2"
      >
        Sari la conținut
      </a>

      <header className="site-header">
        <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4">
          <Link href={`/s/${slug}`} className="display text-[1.35rem] tracking-[-0.05em]">
            {storeName}
          </Link>

          <nav
            aria-label="Navigare magazin"
            className="flex flex-wrap items-center gap-5"
          >
            <Link href={`/s/${slug}`} className="nav-link">
              Catalog
            </Link>
            {signedIn && (
              <>
                <Link href={`/s/${slug}/orders`} className="nav-link">
                  Comenzi
                </Link>
                <Link href={`/s/${slug}/profile`} className="nav-link">
                  Profil
                </Link>
              </>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-5">
            <Link href={`/s/${slug}/cart`} className="nav-link">
              Coș
              {itemCount > 0 && (
                <span className="ml-2 inline-flex min-w-5 justify-center bg-[var(--accent)] px-1.5 py-0.5 text-[0.65rem] tracking-normal text-[var(--accent-fg)]">
                  {itemCount}
                </span>
              )}
            </Link>

            {signedIn ? (
              <form
                action={async () => {
                  "use server";
                  await signOut(slug);
                }}
              >
                <button type="submit" className="nav-link">
                  Ieși
                </button>
              </form>
            ) : (
              <Link href={`/s/${slug}/login`} className="nav-link">
                Cont
              </Link>
            )}
          </div>
        </div>
      </header>

      {!cart.ok && cart.status !== 404 && (
        <p
          role="status"
          className="border-b border-[var(--warning)] bg-[var(--surface-2)] px-5 py-2 text-center text-sm text-[var(--warning)]"
        >
          Unele informații nu au putut fi încărcate: {cart.error}
        </p>
      )}

      <main id="main" className="w-full flex-1">
        {children}
      </main>

      <footer className="mt-auto border-t border-[var(--border)] px-5 py-10">
        <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="display text-2xl">{storeName}</p>
            <p className="mt-2 max-w-md text-sm text-[var(--muted)]">
              Prețurile, livrarea și disponibilitatea sunt evaluate în timp real
              de reguli publicate.
            </p>
          </div>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
            Temă activă · {resolvedTheme?.name ?? themeId}
            {resolvedTheme?.fallback && (
              <span className="text-[var(--warning)]">
                {" "}
                (regula cere „{themeId}”, care nu există — se aplică tema
                implicită)
              </span>
            )}
          </p>
        </div>
      </footer>
    </div>
  );
}
