"use client";

import { useState, useTransition } from "react";
import { Button } from "../ui/button";

/**
 * Runs a candidate version against recorded history from the version screen.
 *
 * Placed where rules are actually edited rather than only in the AI console: the
 * moment someone wants to know what a draft would do is the moment they are
 * looking at it. The result is written as a reviewable suggestion, so the page
 * simply re-renders with it.
 */
export function SimulateVersionButton({
  onSimulate,
  disabled,
  disabledReason,
}: {
  onSimulate: () => Promise<unknown>;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending || disabled}
        onClick={() => {
          setError("");
          startTransition(async () => {
            try {
              await onSimulate();
            } catch (cause) {
              setError(
                cause instanceof Error ? cause.message : "Simularea a eșuat",
              );
            }
          });
        }}
      >
        {pending ? "Se simulează…" : "Simulează pe istoric"}
      </Button>

      {disabled && disabledReason && (
        <p className="text-xs text-[var(--muted)]">{disabledReason}</p>
      )}
      {error && (
        <p role="alert" className="text-xs text-[var(--danger)]">
          {error}
        </p>
      )}
    </div>
  );
}
