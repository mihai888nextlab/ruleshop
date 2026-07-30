import { SiteHeader } from "@/components/site-header";

/** Customer-facing chrome for control-plane storefront routes. */
export function StorefrontChrome({
  store,
  children,
}: {
  store?: { slug: string; name: string; id: string } | null;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <SiteHeader store={store} />
      <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
    </div>
  );
}
