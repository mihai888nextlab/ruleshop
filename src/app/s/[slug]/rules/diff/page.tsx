import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStoreRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStoreBySlug } from "@/lib/store";

function ruleMap(
  rules: {
    key: string;
    name: string;
    priority: number;
    enabled: boolean;
    category: string;
    conditions: unknown;
    actions: unknown;
  }[],
) {
  return Object.fromEntries(rules.map((r) => [r.key, r]));
}

export default async function DiffPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();
  const authz = await requireStoreRole(store.id, "OPERATOR");
  if (!authz.ok) redirect(`/login?next=/s/${slug}/rules/diff`);

  const aVer = Number(sp.a ?? store.deployment?.stableVersion ?? 1);
  const bVer = Number(sp.b ?? aVer);

  const [a, b] = await Promise.all([
    prisma.ruleset.findUnique({
      where: { storeId_version: { storeId: store.id, version: aVer } },
      include: { rules: true },
    }),
    prisma.ruleset.findUnique({
      where: { storeId_version: { storeId: store.id, version: bVer } },
      include: { rules: true },
    }),
  ]);

  const am = ruleMap(a?.rules ?? []);
  const bm = ruleMap(b?.rules ?? []);
  const keys = Array.from(new Set([...Object.keys(am), ...Object.keys(bm)])).sort();

  const rows = keys.map((key) => {
    const left = am[key];
    const right = bm[key];
    if (!left) return { key, kind: "added" as const, left, right };
    if (!right) return { key, kind: "removed" as const, left, right };
    const same =
      JSON.stringify({
        n: left.name,
        p: left.priority,
        e: left.enabled,
        c: left.conditions,
        a: left.actions,
        cat: left.category,
      }) ===
      JSON.stringify({
        n: right.name,
        p: right.priority,
        e: right.enabled,
        c: right.conditions,
        a: right.actions,
        cat: right.category,
      });
    return {
      key,
      kind: same ? ("same" as const) : ("changed" as const),
      left,
      right,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/s/${slug}/rules`} className="text-sm text-[var(--muted)]">
          ← Control plane
        </Link>
        <h1 className="display text-3xl">
          Diff v{aVer} → v{bVer}
        </h1>
      </div>
      <form className="flex flex-wrap gap-2">
        <input type="hidden" name="a" value={aVer} />
        <label className="text-sm">
          A{" "}
          <input
            name="a"
            defaultValue={aVer}
            className="rounded border border-[var(--border)] px-2 py-1"
          />
        </label>
        <label className="text-sm">
          B{" "}
          <input
            name="b"
            defaultValue={bVer}
            className="rounded border border-[var(--border)] px-2 py-1"
          />
        </label>
        <button className="rounded bg-[var(--accent)] px-3 py-1 text-sm text-[var(--accent-fg)]">
          Compară
        </button>
      </form>
      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <li
            key={r.key}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
          >
            <p className="font-medium">
              {r.key}{" "}
              <span className="text-sm text-[var(--muted)]">({r.kind})</span>
            </p>
            {r.kind !== "same" && (
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <pre className="overflow-x-auto rounded bg-red-50 p-2 text-xs">
                  {r.left ? JSON.stringify(r.left, null, 2) : "—"}
                </pre>
                <pre className="overflow-x-auto rounded bg-emerald-50 p-2 text-xs">
                  {r.right ? JSON.stringify(r.right, null, 2) : "—"}
                </pre>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
