import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";

const styles: Record<Variant, string> = {
  primary:
    "bg-[var(--accent)] text-[var(--accent-fg)] hover:opacity-90 shadow-sm",
  secondary:
    "bg-[var(--surface-2)] text-[var(--fg)] hover:bg-[var(--surface-3)]",
  ghost: "bg-transparent text-[var(--fg)] hover:bg-[var(--surface-2)]",
  danger: "bg-red-700 text-white hover:bg-red-800",
  outline:
    "border border-[var(--border)] bg-transparent hover:bg-[var(--surface-2)]",
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
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition disabled:opacity-50",
        size === "sm" && "px-2.5 py-1.5 text-sm",
        size === "md" && "px-3.5 py-2 text-sm",
        size === "lg" && "px-5 py-2.5 text-base",
        styles[variant],
        className,
      )}
      {...props}
    />
  );
});
