import Link from "next/link";
import { listStores } from "@/lib/api";

/**
 * Store picker. The list comes from the control plane over HTTP — this app has
 * no database access, which is what makes the decisioning API load-bearing
 * rather than decorative.
 */
export default async function HomePage() {
  const result = await listStores();

  return (
    <main className="mx-auto max-w-2xl px-6 py-24">
      <h1 className="text-5xl font-semibold tracking-tight">RuleShop</h1>
      <p className="mt-4 text-[var(--muted)]">
        Prețurile, livrarea, disponibilitatea și tema fiecărui magazin sunt
        decise în timp real de un rule engine configurabil.
      </p>

      {!result.ok ? (
        <div className="mt-12 border border-[var(--border)] bg-[var(--surface)] p-6">
          <p className="font-medium">Control plane indisponibil</p>
          <p className="mt-1 text-sm text-[var(--muted)]">{result.error}</p>
        </div>
      ) : (
        <ul className="mt-12 divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {result.data.map((store) => (
            <li key={store.slug}>
              <Link
                href={`/s/${store.slug}`}
                className="flex items-baseline justify-between gap-4 py-5 hover:opacity-70"
              >
                <span className="text-xl">{store.name}</span>
                <span className="text-sm text-[var(--muted)]">/s/{store.slug}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
