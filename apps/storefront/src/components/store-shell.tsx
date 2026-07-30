import { Link, NavLink, Outlet } from "react-router-dom";
import { useRuleShop } from "@/sdk/RuleShopProvider";

export function StoreShell() {
  const { store, authenticated, itemCount, loyaltyPoints, signOut } =
    useRuleShop();
  const storeName = store?.storeName ?? "Magazin";

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-[var(--surface)] focus:px-3 focus:py-2"
      >
        Sari la conținut
      </a>

      <header className="site-header">
        <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4">
          <Link to="/" className="display text-[1.35rem] tracking-[-0.05em]">
            {storeName}
          </Link>

          <nav
            aria-label="Navigare magazin"
            className="flex flex-wrap items-center gap-5"
          >
            <NavLink to="/" end className="text-sm">
              Catalog
            </NavLink>
            <NavLink to="/cart" className="text-sm">
              Coș{itemCount > 0 ? ` (${itemCount})` : ""}
            </NavLink>
            {authenticated ? (
              <>
                <NavLink to="/orders" className="text-sm">
                  Comenzi
                </NavLink>
                <NavLink to="/profile" className="text-sm">
                  Profil
                  {loyaltyPoints !== null && (
                    <span className="ml-1 text-[var(--muted)]">
                      <span className="sr-only">, </span>
                      {loyaltyPoints} p
                    </span>
                  )}
                </NavLink>
                <button
                  type="button"
                  onClick={signOut}
                  className="text-sm text-[var(--muted)]"
                >
                  Ieșire
                </button>
              </>
            ) : (
              <NavLink to="/login" className="text-sm">
                Autentificare
              </NavLink>
            )}
          </nav>
        </div>
      </header>

      <main id="main" className="flex-1">
        <Outlet />
      </main>
    </>
  );
}
