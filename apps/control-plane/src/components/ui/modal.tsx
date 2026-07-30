"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { useT } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";
import { Button } from "./button";

/**
 * Centered dialog for create flows — wide enough for a 2-column form.
 * Escape, backdrop click, and the close button dismiss it.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  const t = useT();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);

    const focusable = panelRef.current?.querySelector<HTMLElement>(
      "input, select, textarea, button, [tabindex]:not([tabindex='-1'])",
    );
    focusable?.focus();

    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label={t("common.close")}
        className="fixed inset-0 bg-[color-mix(in_oklab,var(--fg)_35%,transparent)]"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "relative z-10 my-4 flex max-h-[min(90vh,640px)] w-full max-w-xl flex-col overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-lg squircle",
          className,
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3.5">
          <h2
            id={titleId}
            className="text-lg font-semibold tracking-tight"
          >
            {title}
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={t("common.close")}
            onClick={onClose}
          >
            <X size={16} />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>
      </div>
    </div>
  );
}

export function AddButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label?: string;
}) {
  const t = useT();
  const ariaLabel = label ?? t("common.add");
  return (
    <Button
      type="button"
      variant="outline"
      aria-label={ariaLabel}
      onClick={onClick}
      className="h-10 w-10 shrink-0 px-0 text-xl font-medium leading-none"
    >
      +
    </Button>
  );
}
