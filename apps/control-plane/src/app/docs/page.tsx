import Link from "next/link";
import type { Metadata } from "next";
import { DocsMarkdown } from "@/components/docs-markdown";
import { SiteHeader } from "@/components/site-header";
import { loadStorefrontApiDocs } from "@/lib/load-storefront-docs";

export const metadata: Metadata = {
  title: "Storefront API — RuleShop",
  description:
    "How to connect an external shop to the RuleShop control plane (API key, bootstrap, /api/v1/store).",
};

export default async function DocsPage() {
  const markdown = await loadStorefrontApiDocs();

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
          Public API
        </p>
        <div className="mt-6">
          <DocsMarkdown source={markdown} />
        </div>
        <p className="mt-12 border-t border-[var(--border)] pt-6 text-sm text-[var(--muted)]">
          Base URL for these routes:{" "}
          <code className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-xs">
            {process.env.CONTROL_PLANE_PUBLIC_URL?.replace(/\/$/, "") ||
              "http://localhost:3001"}
          </code>
          .{" "}
          <Link href="/" className="underline">
            Înapoi
          </Link>
        </p>
      </main>
    </div>
  );
}
