import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";

const styles: Record<Variant, string> = {
  primary: "bg-[var(--accent)] text-[var(--accent-fg)] hover:opacity-90",
  secondary:
    "bg-[var(--surface-2)] text-[var(--fg)] hover:bg-[var(--surface-3)]",
  ghost: "bg-transparent text-[var(--fg)] hover:bg-[var(--surface-2)]",
  danger: "bg-[var(--danger)] text-white hover:opacity-90",
  outline:
    "border border-[var(--border)] bg-[var(--surface)] text-[var(--fg)] hover:bg-[var(--surface-2)]",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant;
    size?: "sm" | "md" | "lg";
  }
>(function Button(
  { className, variant = "primary", size = "md", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "squircle inline-flex items-center justify-center gap-2 rounded-[var(--radius)] text-sm font-medium transition-colors disabled:opacity-50",
        size === "sm" && "px-2.5 py-1.5 text-xs",
        size === "md" && "px-3 py-1.5",
        size === "lg" && "px-4 py-2 text-sm",
        styles[variant],
        className,
      )}
      {...props}
    />
  );
});
