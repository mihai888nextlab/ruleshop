import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStoreRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStoreBySlug } from "@/lib/store";

export default async function AuditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();
  const authz = await requireStoreRole(store.id, "OPERATOR");
  if (!authz.ok) redirect(`/login?next=/s/${slug}/rules/audit`);

  const logs = await prisma.auditLog.findMany({
    where: { storeId: store.id },
    orderBy: { createdAt: "desc" },
    take: 150,
    include: { user: { select: { email: true } } },
  });

  return (
    <div className="flex flex-col gap-4">
      <Link href={`/s/${slug}/rules`} className="text-sm text-[var(--muted)]">
        ← Control plane
      </Link>
      <h1 className="display text-3xl">Jurnal de audit</h1>
      <ul className="flex flex-col gap-2">
        {logs.map((l) => (
          <li
            key={l.id}
            className="rounded border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
          >
            <span className="text-[var(--muted)]">
              {l.createdAt.toLocaleString("ro-RO")}
            </span>{" "}
            · <strong>{l.action}</strong>
            {l.entity && (
              <>
                {" "}
                · {l.entity} {l.entityId}
              </>
            )}
            {l.user?.email && (
              <span className="text-[var(--muted)]"> · {l.user.email}</span>
            )}
            {l.meta != null && (
              <pre className="mt-1 overflow-x-auto text-xs">
                {JSON.stringify(l.meta, null, 2)}
              </pre>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
