import { redirect } from "next/navigation";
import { ConnectionPanel } from "@/components/connection-panel";
import { PageHeader } from "@/components/dashboard/shell";
import { getTranslator } from "@/i18n/server";
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

  const t = await getTranslator();

  return (
    <>
      <PageHeader title={t("connection.title")} />
      <ConnectionPanel
        slug={slug}
        apiUrl={info.apiUrl}
        degitSource={info.degitSource}
        storefrontImage={info.storefrontImage}
        keys={info.keys}
      />
    </>
  );
}
