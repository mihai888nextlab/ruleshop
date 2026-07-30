import { notFound, redirect } from "next/navigation";
import { StoreDashboard } from "@/components/dashboard/wrappers";
import { requireStoreRole } from "@/lib/auth";
import { getStoreBySlug } from "@/lib/store";

export default async function RulesSectionLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();

  const authz = await requireStoreRole(store.id, "OPERATOR");
  if (!authz.ok) redirect(`/login?next=/s/${slug}/rules`);

  return (
    <StoreDashboard store={{ slug: store.slug, name: store.name }}>
      {children}
    </StoreDashboard>
  );
}
