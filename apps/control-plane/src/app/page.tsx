import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";

export default async function HomePage() {
  const session = await auth();
  const isPlatformAdmin = session?.user?.platformRole === "PLATFORM_ADMIN";

  const [allStores, myAdminStores] = await Promise.all([
    isPlatformAdmin
      ? prisma.store.findMany({ orderBy: { name: "asc" } })
      : Promise.resolve([]),
    session?.user?.id
      ? prisma.store.findMany({
          where: {
            memberships: {
              some: {
                userId: session.user.id,
                role: { in: ["STORE_ADMIN", "OPERATOR"] },
              },
            },
          },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const stores = isPlatformAdmin ? allStores : myAdminStores;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <SiteHeader />
      <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-5xl flex-col justify-center px-4 py-14">
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
          RuleShop
        </h1>
        <p className="mt-3 max-w-lg text-sm text-[var(--muted)] sm:text-base">
          Publică reguli pentru prețuri, livrare, antifraudă și temă — fără să
          republici codul magazinului.
        </p>

        <div className="mt-7 flex flex-wrap gap-2">
          {isPlatformAdmin && (
            <Link href="/platform">
              <Button>Administrare platformă</Button>
            </Link>
          )}
          <Link href="/docs">
            <Button variant={isPlatformAdmin || session?.user ? "outline" : "primary"}>
              API docs
            </Button>
          </Link>
          {session?.user ? (
            myAdminStores[0] && (
              <Link href={`/s/${myAdminStores[0].slug}/admin`}>
                <Button variant="outline">
                  Dashboard {myAdminStores[0].name}
                </Button>
              </Link>
            )
          ) : (
            <>
              <Link href="/login">
                <Button variant="outline">Autentificare</Button>
              </Link>
              <Link href="/register">
                <Button variant="outline">Deschide un magazin</Button>
              </Link>
            </>
          )}
        </div>

        <div className="mt-10 divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {stores.length === 0 ? (
            <div className="py-6 text-sm text-[var(--muted)]">
              {session?.user
                ? "Nu ai încă un magazin. Un administrator de platformă ți-l poate crea, sau deschide unul nou."
                : "Niciun magazin încă."}{" "}
              {!session?.user && (
                <Link href="/register" className="underline">
                  Deschide un magazin
                </Link>
              )}
            </div>
          ) : (
            stores.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">
                    {s.name}
                  </h2>
                  <p className="text-xs text-[var(--muted)]">/{s.slug}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/s/${s.slug}/admin/connection`}>
                    <Button size="sm" variant="outline">
                      Conexiune
                    </Button>
                  </Link>
                  <Link href={`/s/${s.slug}/admin`}>
                    <Button size="sm">Dashboard</Button>
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
