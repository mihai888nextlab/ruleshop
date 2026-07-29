import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";

export default async function PlatformPage() {
  const session = await auth();
  if (!session?.user || session.user.platformRole !== "PLATFORM_ADMIN") {
    redirect("/login?next=/platform");
  }

  const stores = await prisma.store.findMany({
    include: {
      _count: {
        select: {
          products: true,
          orders: true,
          rulesets: true,
          evaluations: true,
        },
      },
      deployment: true,
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="mesh min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="display text-4xl">Administrare platformă</h1>
        <p className="mt-2 text-[var(--muted)]">
          Izolare multi-tenant: fiecare magazin are catalog, reguli și istoric
          propriu.
        </p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {stores.map((s) => (
            <li
              key={s.id}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
            >
              <h2 className="display text-2xl">{s.name}</h2>
              <p className="text-sm text-[var(--muted)]">/{s.slug}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone="muted">{s._count.products} produse</Badge>
                <Badge tone="muted">{s._count.orders} comenzi</Badge>
                <Badge tone="muted">{s._count.rulesets} versiuni</Badge>
                <Badge tone="muted">{s._count.evaluations} evaluări</Badge>
                <Badge tone="ok">
                  stable v{s.deployment?.stableVersion ?? "—"}
                </Badge>
              </div>
              <div className="mt-4 flex gap-3 text-sm">
                <Link href={`/s/${s.slug}`} className="underline">
                  Magazin
                </Link>
                <Link href={`/s/${s.slug}/rules`} className="underline">
                  Reguli
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
