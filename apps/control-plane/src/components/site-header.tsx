import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "./ui/button";

export async function SiteHeader({
  store,
}: {
  store?: { slug: string; name: string; id: string } | null;
}) {
  const session = await auth();
  let isStaff = false;
  if (store && session?.user?.id) {
    if (session.user.platformRole === "PLATFORM_ADMIN") isStaff = true;
    else {
      const m = await prisma.membership.findUnique({
        where: {
          storeId_userId: { storeId: store.id, userId: session.user.id },
        },
      });
      isStaff =
        m?.role === "OPERATOR" ||
        m?.role === "STORE_ADMIN" ||
        m?.role === "PLATFORM_ADMIN";
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2.5">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-[15px] font-semibold tracking-tight">
            RuleShop
          </Link>
          {store && (
            <nav className="flex flex-wrap items-center gap-3 text-sm text-[var(--muted)]">
              <Link href={`/s/${store.slug}`} className="hover:text-[var(--fg)]">
                {store.name}
              </Link>
              <Link
                href={`/s/${store.slug}/cart`}
                className="hover:text-[var(--fg)]"
              >
                Coș
              </Link>
              <Link
                href={`/s/${store.slug}/orders`}
                className="hover:text-[var(--fg)]"
              >
                Comenzi
              </Link>
              {isStaff && (
                <>
                  <Link
                    href={`/s/${store.slug}/admin`}
                    className="font-medium text-[var(--accent)]"
                  >
                    Dashboard
                  </Link>
                  <Link
                    href={`/s/${store.slug}/rules`}
                    className="hover:text-[var(--fg)]"
                  >
                    Reguli
                  </Link>
                </>
              )}
            </nav>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link href="/docs">
            <Button variant="ghost" size="sm">
              Docs
            </Button>
          </Link>
          {session?.user ? (
            <>
              <span className="hidden text-[var(--muted)] sm:inline">
                {session.user.email}
              </span>
              {session.user.platformRole === "PLATFORM_ADMIN" && (
                <Link href="/platform">
                  <Button variant="outline" size="sm">
                    Platformă
                  </Button>
                </Link>
              )}
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <Button type="submit" variant="ghost" size="sm">
                  Ieșire
                </Button>
              </form>
            </>
          ) : (
            <Link href={`/login${store ? `?next=/s/${store.slug}` : ""}`}>
              <Button variant="outline" size="sm">
                Autentificare
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
