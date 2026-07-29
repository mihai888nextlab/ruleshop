import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-lg flex-col gap-4 px-6 py-24">
      <h1 className="display text-4xl">Pagina nu există</h1>
      <p className="text-[var(--muted)]">
        Adresa cerută nu corespunde niciunui magazin, produs sau comandă
        accesibilă.
      </p>
      <Link href="/" className="text-sm underline">
        ← Toate magazinele
      </Link>
    </main>
  );
}
