import { redirect } from "next/navigation";
import { ConnectionPanel } from "@/components/connection-panel";
import { PageHeader } from "@/components/dashboard/shell";
import { requireStoreRole } from "@/lib/auth";
import { getStoreBySlug } from "@/lib/store";
import { getStoreConnectionInfo } from "@/app/actions/stores";

export default async function ConnectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) redirect("/");

  const authz = await requireStoreRole(store.id, "STORE_ADMIN");
  if (!authz.ok) redirect(`/login?next=/s/${slug}/admin/connection`);

  const info = await getStoreConnectionInfo(slug);
  if (!info) redirect("/");

  return (
    <>
      <PageHeader title="Conexiune storefront" />
      <ConnectionPanel
        slug={slug}
        apiUrl={info.apiUrl}
        degitSource={info.degitSource}
        keys={info.keys}
      />
    </>
  );
}
