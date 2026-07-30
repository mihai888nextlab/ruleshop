"use client";

import { useState } from "react";
import type { FieldDef } from "@ruleshop/engine";
import { Button } from "../ui/button";
import { RuleBuilder, type RuleDraft } from "./rule-builder";

/**
 * Collapsible wrapper around the builder.
 *
 * A ruleset page can hold a dozen rules, and mounting a full editor for each one
 * would bury the list it is meant to support. Editors open on demand instead.
 */
export function RuleEditorPanel({
  customFields,
  themeKeys = [],
  initial,
  onSave,
  openLabel,
  startOpen = false,
}: {
  customFields: FieldDef[];
  themeKeys?: string[];
  initial?: Partial<RuleDraft>;
  onSave: (rule: unknown) => Promise<void>;
  openLabel: string;
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        {openLabel}
      </Button>
    );
  }

  return (
    <RuleBuilder
      customFields={customFields}
      themeKeys={themeKeys}
      initial={initial}
      onSave={onSave}
      onCancel={() => setOpen(false)}
    />
  );
}
