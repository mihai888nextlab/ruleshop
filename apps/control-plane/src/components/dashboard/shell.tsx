"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  ClipboardList,
  FlaskConical,
  GitCompare,
  LayoutDashboard,
  ScrollText,
  Shield,
  Sparkles,
  Store,
  Tags,
  Workflow,
  Palette,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type DashNavItem = {
  href: string;
  label: string;
  icon?: React.ReactNode;
  exact?: boolean;
};

function NavList({ items }: { items: DashNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            data-active={active}
            className="dash-nav-link"
          >
            <span className="opacity-80">{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
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
  const primary: DashNavItem[] = storeSlug
    ? [
        {
          href: `/s/${storeSlug}/admin`,
          label: "Overview",
          icon: <LayoutDashboard size={16} />,
          exact: true,
        },
        {
          href: `/s/${storeSlug}/rules`,
          label: "Reguli",
          icon: <Workflow size={16} />,
          exact: true,
        },
        {
          href: `/s/${storeSlug}/attributes`,
          label: "Schema",
          icon: <Tags size={16} />,
        },
        {
          href: `/s/${storeSlug}/themes`,
          label: "Teme",
          icon: <Palette size={16} />,
        },
        {
          href: `/s/${storeSlug}/admin/products`,
          label: "Produse",
          icon: <Boxes size={16} />,
        },
        {
          href: `/s/${storeSlug}/admin/orders`,
          label: "Comenzi",
          icon: <ClipboardList size={16} />,
        },
      ]
    : [
        {
          href: "/platform",
          label: "Magazine",
          icon: <LayoutDashboard size={16} />,
          exact: true,
        },
      ];

  const secondary: DashNavItem[] = storeSlug
    ? [
        {
          href: `/s/${storeSlug}/rules/test`,
          label: "Test harness",
          icon: <FlaskConical size={16} />,
        },
        {
          href: `/s/${storeSlug}/rules/evaluations`,
          label: "Evaluări",
          icon: <ScrollText size={16} />,
        },
        {
          href: `/s/${storeSlug}/rules/diff`,
          label: "Diff",
          icon: <GitCompare size={16} />,
        },
        {
          href: `/s/${storeSlug}/rules/audit`,
          label: "Audit",
          icon: <Shield size={16} />,
        },
        {
          href: `/s/${storeSlug}/rules/ai`,
          label: "AI",
          icon: <Sparkles size={16} />,
        },
      ]
    : [];

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-[var(--sidebar)] px-3 py-4 text-[var(--sidebar-fg)] md:flex">
        <div className="px-2 pb-5">
          <Link href="/" className="display text-lg tracking-tight">
            RuleShop
          </Link>
          <p className="mt-1 text-[0.7rem] uppercase tracking-[0.16em] text-[var(--sidebar-muted)]">
            Control plane
          </p>
        </div>

        <div className="px-2 pb-3">
          <p className="display text-base leading-tight">{title}</p>
          {subtitle && (
            <p className="mt-1 text-xs text-[var(--sidebar-muted)]">{subtitle}</p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-0.5">
          <p className="mb-1 px-2 text-[0.65rem] uppercase tracking-[0.14em] text-[var(--sidebar-muted)]">
            Principal
          </p>
          <NavList items={primary} />

          {secondary.length > 0 && (
            <>
              <p className="mb-1 mt-5 px-2 text-[0.65rem] uppercase tracking-[0.14em] text-[var(--sidebar-muted)]">
                Instrumente
              </p>
              <NavList items={secondary} />
            </>
          )}
        </div>

        <div className="mt-4 space-y-1 border-t border-white/10 px-0.5 pt-3">
          {storeSlug && (
            <Link href={`/s/${storeSlug}`} className="dash-nav-link">
              <Store size={16} />
              Magazin live
            </Link>
          )}
          {!storeSlug && (
            <Link href="/" className="dash-nav-link">
              <Store size={16} />
              Acasă
            </Link>
          )}
          {footer}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--surface)]/85 backdrop-blur md:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="display text-base">{title}</p>
              {subtitle && (
                <p className="text-xs text-[var(--muted)]">{subtitle}</p>
              )}
            </div>
            <Link href="/" className="text-sm text-[var(--muted)]">
              RuleShop
            </Link>
          </div>
          <div className="flex gap-1 overflow-x-auto px-3 pb-3">
            {primary.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "shrink-0 rounded-full border border-[var(--border)] px-3 py-1 text-xs",
                  "hover:border-[var(--accent)]",
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="display mt-2 text-3xl sm:text-4xl">{title}</h1>
        {description && (
          <p className="mt-2 text-sm text-[var(--muted)] sm:text-base">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="stat reveal">
      <p className="eyebrow">{label}</p>
      <p className="display mt-2 text-3xl tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p>}
    </div>
  );
}
