"use client";

import { useState, useTransition } from "react";
import {
  DEFAULT_THEME_TOKENS,
  type ThemeTokens,
} from "@ruleshop/contracts";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { AddButton, Modal } from "../ui/modal";
import { ThemeEditor } from "./theme-editor";
import { ThemePreview } from "./theme-preview";

/**
 * The theme library.
 *
 * Each card shows which rules select the theme, because that is the difference
 * between a design experiment and something customers are seeing right now.
 */

export interface ThemeRow {
  id: string;
  key: string;
  name: string;
  tokens: ThemeTokens;
  isDefault: boolean;
  /** Rules that select this theme, gathered in the page's server component. */
  usedBy: { ruleKey: string; rulesetVersion: number; live: boolean }[];
}

export interface ThemeActions {
  create: (input: {
    key: string;
    name: string;
    tokens: ThemeTokens;
  }) => Promise<unknown>;
  update: (
    id: string,
    input: { name: string; tokens: ThemeTokens },
  ) => Promise<unknown>;
  setDefault: (id: string) => Promise<unknown>;
  duplicate: (id: string) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
  uploadHero: (formData: FormData) => Promise<string>;
}

export function ThemeManager({
  themes,
  actions,
}: {
  themes: ThemeRow[];
  actions: ThemeActions;
}) {
  const [creating, setCreating] = useState(themes.length === 0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<unknown>) {
    setError("");
    startTransition(async () => {
      try {
        await fn();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Operațiune eșuată");
      }
    });
  }

  const editing = themes.find((theme) => theme.id === editingId) ?? null;

  return (
    <div className="flex flex-col gap-8">
      {error && (
        <p
          role="alert"
          className="rounded-[var(--radius)] border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}

      {editing && (
        <section className="panel p-5">
          <h2 className="mb-4 text-lg font-semibold tracking-tight">
            Editează „{editing.name}”
          </h2>
          <ThemeEditor
            isNew={false}
            initialKey={editing.key}
            initialName={editing.name}
            initialTokens={editing.tokens}
            onUploadHero={actions.uploadHero}
            onSave={async (input) => {
              await actions.update(editing.id, {
                name: input.name,
                tokens: input.tokens,
              });
              setEditingId(null);
            }}
            onCancel={() => setEditingId(null)}
          />
        </section>
      )}

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-baseline gap-2 text-lg font-semibold tracking-tight">
            Teme definite
            <span className="text-sm font-normal tabular-nums text-[var(--muted)]">
              {themes.length}
            </span>
          </h2>
          <AddButton
            label="Adaugă temă"
            onClick={() => setCreating(true)}
          />
        </div>

        {themes.length === 0 ? (
          <p className="rounded-[var(--radius)] border border-dashed border-[var(--border)] p-6 text-sm text-[var(--muted)]">
            Nicio temă definită.
          </p>
        ) : (
          <ul className="grid gap-5 lg:grid-cols-2">
            {themes.map((theme) => (
              <li key={theme.id} className="panel flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium">{theme.name}</h3>
                  <code className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-xs">
                    {theme.key}
                  </code>
                  {theme.isDefault && <Badge tone="ok">implicită</Badge>}
                  {theme.usedBy.some((use) => use.live) && (
                    <Badge tone="accent">activă în reguli</Badge>
                  )}
                </div>

                <ThemePreview tokens={theme.tokens} storeName={theme.name} />

                <p className="text-xs text-[var(--muted)]">
                  {theme.usedBy.length === 0
                    ? "Nicio regulă nu selectează această temă."
                    : `Selectată de: ${theme.usedBy
                        .map(
                          (use) =>
                            `${use.ruleKey} (v${use.rulesetVersion}${use.live ? ", live" : ""})`,
                        )
                        .join(", ")}`}
                </p>

                <div className="mt-auto flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      setEditingId(editingId === theme.id ? null : theme.id)
                    }
                  >
                    {editingId === theme.id ? "Închide" : "Editează"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={pending}
                    onClick={() => run(() => actions.duplicate(theme.id))}
                  >
                    Duplică
                  </Button>
                  {!theme.isDefault && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => run(() => actions.setDefault(theme.id))}
                    >
                      Setează implicită
                    </Button>
                  )}
                  <DeleteButton
                    disabled={pending}
                    onConfirm={() => run(() => actions.remove(theme.id))}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal
        open={creating}
        onClose={() => {
          if (themes.length > 0) setCreating(false);
        }}
        title="Temă nouă"
        className="max-w-lg"
      >
        <ThemeEditor
          isNew
          initialKey=""
          initialName=""
          initialTokens={DEFAULT_THEME_TOKENS}
          onUploadHero={actions.uploadHero}
          onSave={async (input) => {
            await actions.create(input);
            setCreating(false);
          }}
          onCancel={
            themes.length > 0 ? () => setCreating(false) : undefined
          }
        />
      </Modal>
    </div>
  );
}

function DeleteButton({
  onConfirm,
  disabled,
}: {
  onConfirm: () => void;
  disabled: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        onClick={() => setConfirming(true)}
      >
        Șterge
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="danger"
      size="sm"
      disabled={disabled}
      onClick={() => {
        setConfirming(false);
        onConfirm();
      }}
    >
      Confirmă ștergerea
    </Button>
  );
}
