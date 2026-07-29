import { cn } from "@/lib/utils";

export function Badge({
  children,
  className,
  tone = "default",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "default" | "accent" | "warn" | "ok" | "muted";
}) {
  const tones = {
    default: "bg-[var(--surface-2)] text-[var(--fg)]",
    accent: "bg-[var(--accent)]/15 text-[var(--accent)]",
    warn: "bg-amber-500/15 text-amber-800",
    ok: "bg-emerald-500/15 text-emerald-800",
    muted: "bg-[var(--surface-2)] text-[var(--muted)]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
