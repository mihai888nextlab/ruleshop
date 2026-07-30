"use client";

import { useState, useTransition, type FormEvent } from "react";
import { createStoreAction, type CreateStoreResult } from "@/app/actions/stores";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Created = Extract<CreateStoreResult, { ok: true }>;

export function CreateStoreForm() {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createStoreAction({
        name,
        slug,
        adminName,
        adminEmail,
        adminPassword,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCreated(result);
      setName("");
      setSlug("");
      setAdminName("");
      setAdminEmail("");
      setAdminPassword("");
    });
  }

  if (created) {
    return (
      <div className="panel flex flex-col gap-4 p-5">
        <h2 className="text-lg font-semibold">
          Magazin creat: {created.store.name}
        </h2>
        <p className="text-sm text-[var(--muted)]">
          Cont admin:{" "}
          <code className="text-xs">{created.admin.email}</code>
          {created.adminReused
            ? " (cont existent atașat)"
            : " (cont nou)"}
          . Copiază cheia API acum — nu o vom mai afișa.
        </p>
        <label className="flex flex-col gap-1 text-sm">
          Cheie API
          <code className="break-all rounded bg-[var(--surface-2)] px-3 py-2 text-xs">
            {created.apiKey}
          </code>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Comandă clone
          <pre className="overflow-x-auto rounded bg-[var(--surface-2)] px-3 py-2 text-xs leading-relaxed">
            {created.cloneCommand}
          </pre>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => void navigator.clipboard.writeText(created.apiKey)}
          >
            Copiază cheia
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              void navigator.clipboard.writeText(created.cloneCommand)
            }
          >
            Copiază comanda
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setCreated(null)}
          >
            Închide
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="panel flex flex-col gap-3 p-5">
      <h2 className="text-lg font-semibold">Magazin nou</h2>
      <p className="text-sm text-[var(--muted)]">
        Creează magazinul din șablon (temă, reguli v1, schemă) plus un cont
        STORE_ADMIN și o cheie API unică.
      </p>

      <label className="flex flex-col gap-1 text-sm">
        Nume magazin
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slug || slug === slugify(name)) {
              setSlug(slugify(e.target.value));
            }
          }}
          required
          minLength={2}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Slug
        <Input
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase())}
          required
          pattern="[a-z][a-z0-9-]*"
        />
      </label>

      <div className="mt-2 border-t border-[var(--border)] pt-3">
        <p className="mb-2 text-sm font-medium">Administrator magazin</p>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Nume
            <Input
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Email
            <Input
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Parolă
            <Input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
        </div>
      </div>

      {error && (
        <p className="text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Se creează…" : "Creează magazin + admin"}
      </Button>
    </form>
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
