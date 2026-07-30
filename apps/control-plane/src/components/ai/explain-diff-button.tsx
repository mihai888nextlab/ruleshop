"use client";

import { useState, useTransition } from "react";
import { Button } from "../ui/button";

/**
 * Asks for a plain-language reading of a diff, from the diff screen.
 *
 * This is the moment it is worth having: someone is about to publish, and the
 * person approving is often not the person who wrote the rules. The structural
 * diff next to it stays the authority — this only translates it.
 */
export function ExplainDiffButton({
  onExplain,
  disabled,
  disabledReason,
}: {
  onExplain: () => Promise<unknown>;
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
              await onExplain();
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Explicația nu a putut fi generată",
              );
            }
          });
        }}
      >
        {pending ? "Se explică…" : "Explică în limbaj natural"}
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
