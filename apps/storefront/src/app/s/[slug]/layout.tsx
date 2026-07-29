import Link from "next/link";
import { notFound } from "next/navigation";
import { signOut } from "@/app/actions";
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
  const storeName = cart.ok ? cart.data.store.name : slug;
  const itemCount = cart.ok
    ? cart.data.lines.reduce((n, line) => n + line.quantity, 0)
    : 0;

  return (
    <div data-theme={themeId} className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-[var(--surface)] focus:px-3 focus:py-2"
      >
        Sari la conținut
      </a>

      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
          <Link href={`/s/${slug}`} className="display text-xl">
            {storeName}
          </Link>

          <nav
            aria-label="Navigare magazin"
            className="flex flex-wrap items-center gap-4 text-sm"
          >
            <Link href={`/s/${slug}`} className="hover:underline">
              Catalog
            </Link>
            {signedIn && (
              <>
                <Link href={`/s/${slug}/orders`} className="hover:underline">
                  Comenzi
                </Link>
                <Link href={`/s/${slug}/profile`} className="hover:underline">
                  Profil
                </Link>
              </>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-4 text-sm">
            <Link href={`/s/${slug}/cart`} className="hover:underline">
              Coș
              {itemCount > 0 && (
                <span className="ml-1.5 inline-flex min-w-5 justify-center bg-[var(--accent)] px-1.5 py-0.5 text-xs text-[var(--accent-fg)]">
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
                <button type="submit" className="hover:underline">
                  Ieși
                </button>
              </form>
            ) : (
              <Link href={`/s/${slug}/login`} className="hover:underline">
                Intră în cont
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

      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-5 py-10">
        {children}
      </main>

      <footer className="border-t border-[var(--border)] px-5 py-6">
        <p className="mx-auto max-w-5xl text-xs text-[var(--muted)]">
          Prețurile, livrarea, disponibilitatea și aspectul acestui magazin sunt
          decise în timp real de un rule engine configurabil. Tema activă:{" "}
          <span className="font-medium">{themeId}</span>.
        </p>
      </footer>
    </div>
  );
}
