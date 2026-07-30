import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard/shell";

export async function StoreDashboard({
  store,
  children,
}: {
  store: { slug: string; name: string };
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <DashboardShell
      title={store.name}
      subtitle={`/${store.slug}`}
      storeSlug={store.slug}
      footer={
        session?.user ? (
          <div className="px-2 pt-2">
            <p className="truncate text-xs text-[var(--sidebar-muted)]">
              {session.user.email}
            </p>
            <div className="mt-2 flex flex-col gap-1">
              {session.user.platformRole === "PLATFORM_ADMIN" && (
                <Link
                  href="/platform"
                  className="text-xs text-[var(--sidebar-muted)] hover:text-[var(--sidebar-fg)]"
                >
                  Platformă →
                </Link>
              )}
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button
                  type="submit"
                  className="text-xs text-[var(--sidebar-muted)] hover:text-[var(--sidebar-fg)]"
                >
                  Ieșire
                </button>
              </form>
            </div>
          </div>
        ) : (
          <Link href={`/login?next=/s/${store.slug}/admin`} className="dash-nav-link">
            Autentificare
          </Link>
        )
      }
    >
      {children}
    </DashboardShell>
  );
}

export async function PlatformDashboard({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <DashboardShell
      title="Platformă"
      subtitle="Toate magazinele"
      footer={
        session?.user ? (
          <div className="px-2 pt-2">
            <p className="truncate text-xs text-[var(--sidebar-muted)]">
              {session.user.email}
            </p>
            <form
              className="mt-2"
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button
                type="submit"
                className="text-xs text-[var(--sidebar-muted)] hover:text-[var(--sidebar-fg)]"
              >
                Ieșire
              </button>
            </form>
          </div>
        ) : (
          <Link href="/login?next=/platform" className="dash-nav-link">
            Autentificare
          </Link>
        )
      }
    >
      {children}
    </DashboardShell>
  );
}
