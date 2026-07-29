import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";

export default async function HomePage() {
  const stores = await prisma.store.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="mesh min-h-screen">
      <SiteHeader />
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col justify-center px-4 py-16">
        <p className="mb-3 text-sm uppercase tracking-[0.2em] text-[var(--muted)]">
          Control plane + magazine
        </p>
        <h1 className="display max-w-3xl text-5xl leading-[1.05] text-[var(--fg)] sm:text-6xl">
          RuleShop
        </h1>
        <p className="mt-4 max-w-xl text-lg text-[var(--muted)]">
          Deciziile magazinului — prețuri, livrare, antifraudă, temă — rulează
          dintr-un motor de reguli pe care îl publici fără a republica codul.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {stores.map((s) => (
            <Link
              key={s.id}
              href={`/s/${s.slug}`}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 transition hover:border-[var(--accent)]"
            >
              <h2 className="display text-2xl">{s.name}</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">/{s.slug}</p>
              <span className="mt-4 inline-block text-sm text-[var(--accent)]">
                Intră în magazin →
              </span>
            </Link>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/login">
            <Button>Autentificare</Button>
          </Link>
          <Link href="/register">
            <Button variant="outline">Cont nou</Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
