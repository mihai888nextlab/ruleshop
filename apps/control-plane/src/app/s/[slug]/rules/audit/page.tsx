import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/dashboard/shell";
import { AuditList } from "@/components/lists/audit-list";
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
      <PageHeader title="Jurnal de audit" />
      <AuditList
        logs={logs.map((l) => ({
          id: l.id,
          action: l.action,
          entity: l.entity,
          entityId: l.entityId,
          email: l.user?.email ?? null,
          createdAt: l.createdAt.toISOString(),
          meta: l.meta != null ? JSON.stringify(l.meta, null, 2) : null,
        }))}
      />
    </div>
  );
}
