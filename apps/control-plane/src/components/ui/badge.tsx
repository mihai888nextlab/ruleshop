import { cn } from "@/lib/utils";

export function Badge({
  children,
  className,
  tone = "default",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "default" | "accent" | "warn" | "ok" | "muted" | "danger";
}) {
  const tones = {
    default: "border-[var(--border)] bg-[var(--surface-2)] text-[var(--fg)]",
    accent: "border-[var(--border)] bg-[var(--surface-2)] text-[var(--fg)]",
    warn: "border-[var(--warn)]/30 bg-transparent text-[var(--warn)]",
    ok: "border-[var(--ok)]/30 bg-transparent text-[var(--ok)]",
    muted: "border-[var(--border)] bg-transparent text-[var(--muted)]",
    danger: "border-[var(--danger)]/30 bg-transparent text-[var(--danger)]",
  };
  return (
    <span
      className={cn(
        "squircle inline-flex items-center rounded-[var(--radius)] border px-1.5 py-0.5 text-[11px] font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
