"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Boxes,
  ClipboardList,
  FlaskConical,
  GitCompare,
  LayoutDashboard,
  Palette,
  ScrollText,
  Shield,
  Sparkles,
  Store,
  Tags,
  Workflow,
} from "lucide-react";
import { PreferencesControls } from "@/components/preferences-controls";
import { useT } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";

export type DashNavItem = {
  href: string;
  label: string;
  icon?: React.ReactNode;
  exact?: boolean;
  match?: (pathname: string) => boolean;
};

type NavSection = {
  id: string;
  label: string;
  items: DashNavItem[];
};

function isActive(pathname: string, item: DashNavItem): boolean {
  if (item.match) return item.match(pathname);
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavList({ items }: { items: DashNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            data-active={active}
            className="dash-nav-link"
          >
            <span className="dash-nav-icon">{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function storeSections(
  storeSlug: string,
  t: (key: string) => string,
): NavSection[] {
  return [
    {
      id: "magazin",
      label: t("nav.store"),
      items: [
        {
          href: `/s/${storeSlug}/admin`,
          label: t("nav.overview"),
          icon: <LayoutDashboard size={15} />,
          exact: true,
        },
        {
          href: `/s/${storeSlug}/admin/products`,
          label: t("nav.products"),
          icon: <Boxes size={15} />,
        },
        {
          href: `/s/${storeSlug}/admin/orders`,
          label: t("nav.orders"),
          icon: <ClipboardList size={15} />,
        },
        {
          href: `/s/${storeSlug}/admin/analytics`,
          label: t("nav.analytics"),
          icon: <BarChart3 size={15} />,
        },
        {
          href: `/s/${storeSlug}/admin/connection`,
          label: t("nav.connection"),
          icon: <Store size={15} />,
        },
      ],
    },
    {
      id: "decizii",
      label: t("nav.decisions"),
      items: [
        {
          href: `/s/${storeSlug}/rules`,
          label: t("nav.rules"),
          icon: <Workflow size={15} />,
          match: (pathname) =>
            pathname === `/s/${storeSlug}/rules` ||
            /^\/s\/[^/]+\/rules\/\d+(\/.*)?$/.test(pathname),
        },
        {
          href: `/s/${storeSlug}/attributes`,
          label: t("nav.schema"),
          icon: <Tags size={15} />,
        },
        {
          href: `/s/${storeSlug}/themes`,
          label: t("nav.themes"),
          icon: <Palette size={15} />,
        },
        {
          href: `/s/${storeSlug}/rules/evaluations`,
          label: t("nav.evaluations"),
          icon: <ScrollText size={15} />,
        },
      ],
    },
    {
      id: "laborator",
      label: t("nav.lab"),
      items: [
        {
          href: `/s/${storeSlug}/rules/test`,
          label: t("nav.testHarness"),
          icon: <FlaskConical size={15} />,
        },
        {
          href: `/s/${storeSlug}/rules/diff`,
          label: t("nav.diff"),
          icon: <GitCompare size={15} />,
        },
        {
          href: `/s/${storeSlug}/rules/ai`,
          label: t("nav.ai"),
          icon: <Sparkles size={15} />,
        },
        {
          href: `/s/${storeSlug}/rules/audit`,
          label: t("nav.audit"),
          icon: <Shield size={15} />,
        },
      ],
    },
  ];
}

export function DashboardShell({
  title,
  subtitle,
  storeSlug,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  storeSlug?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const t = useT();
  const pathname = usePathname();
  const platformSections: NavSection[] = [
    {
      id: "platform",
      label: t("nav.platform"),
      items: [
        {
          href: "/platform",
          label: t("nav.stores"),
          icon: <LayoutDashboard size={15} />,
          exact: true,
        },
      ],
    },
  ];
  const sections = storeSlug ? storeSections(storeSlug, t) : platformSections;
  const mobileItems = storeSlug
    ? [...sections[0]!.items, ...sections[1]!.items]
    : sections.flatMap((s) => s.items);

  return (
    <div className="flex min-h-screen bg-[var(--bg)]">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-white/10 bg-[var(--sidebar)] px-2.5 py-4 text-[var(--sidebar-fg)] md:flex">
        <div className="px-2 pb-4">
          <Link href="/" className="text-[15px] font-semibold tracking-tight">
            {t("common.appName")}
          </Link>
          <p className="mt-0.5 text-xs text-[var(--sidebar-muted)]">
            {t("common.controlPlane")}
          </p>
        </div>

        <div className="border-b border-white/10 px-2 pb-3">
          <p className="text-sm font-medium leading-tight">{title}</p>
          {subtitle && (
            <p className="mt-0.5 text-xs text-[var(--sidebar-muted)]">
              {subtitle}
            </p>
          )}
        </div>

        <div className="mt-3 flex-1 overflow-y-auto px-0.5">
          {sections.map((section, index) => (
            <div
              key={section.id}
              className={index === 0 ? undefined : "mt-5"}
            >
              <p className="dash-nav-section">{section.label}</p>
              <NavList items={section.items} />
            </div>
          ))}
        </div>

        <div className="mt-3 space-y-2 border-t border-white/10 px-0.5 pt-3">
          <PreferencesControls compact />
          {storeSlug && (
            <Link href={`/s/${storeSlug}`} className="dash-nav-link">
              <span className="dash-nav-icon">
                <Store size={15} />
              </span>
              {t("nav.liveStore")}
            </Link>
          )}
          {!storeSlug && (
            <Link href="/" className="dash-nav-link">
              <span className="dash-nav-icon">
                <Store size={15} />
              </span>
              {t("common.home")}
            </Link>
          )}
          {footer}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--surface)] md:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-sm font-semibold">{title}</p>
              {subtitle && (
                <p className="text-xs text-[var(--muted)]">{subtitle}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <PreferencesControls />
              <Link href="/" className="text-sm text-[var(--muted)]">
                {t("common.appName")}
              </Link>
            </div>
          </div>
          <div className="flex gap-1 overflow-x-auto px-3 pb-3">
            {mobileItems.map((item) => {
              const active = isActive(pathname, item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-active={active}
                  className={cn(
                    "shrink-0 rounded-[var(--radius)] border px-2.5 py-1 text-xs",
                    active
                      ? "border-[var(--fg)] bg-[var(--fg)] text-[var(--accent-fg)]"
                      : "border-[var(--border)] hover:bg-[var(--surface-2)]",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-7 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  actions,
}: {
  title: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--border)] pb-5">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        {title}
      </h1>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="stat squircle">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight">
        {value}
      </p>
    </div>
  );
}
