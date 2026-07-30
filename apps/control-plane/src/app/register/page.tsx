"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { openStoreAction, type CreateStoreResult } from "@/app/actions/stores";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Created = Extract<CreateStoreResult, { ok: true }>;

export default function RegisterPage() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [created, setCreated] = useState<Created | null>(null);
  const [storeName, setStoreName] = useState("");
  const [slug, setSlug] = useState("");

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await openStoreAction({
        name: String(fd.get("storeName") ?? ""),
        slug: String(fd.get("slug") ?? ""),
        adminName: String(fd.get("name") ?? ""),
        adminEmail: String(fd.get("email") ?? ""),
        adminPassword: String(fd.get("password") ?? ""),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCreated(result);
    });
  }

  if (created) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
        <div className="w-full max-w-lg border border-[var(--border)] bg-[var(--surface)] p-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            Magazin gata: {created.store.name}
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Cont admin{" "}
            <code className="text-xs">{created.admin.email}</code>. Copiază
            cheia API acum — nu o vom mai afișa.
          </p>
          <label className="mt-5 flex flex-col gap-1 text-sm">
            Cheie API
            <code className="break-all rounded bg-[var(--surface-2)] px-3 py-2 text-xs">
              {created.apiKey}
            </code>
          </label>
          <label className="mt-3 flex flex-col gap-1 text-sm">
            Clone storefront
            <pre className="overflow-x-auto rounded bg-[var(--surface-2)] px-3 py-2 text-xs leading-relaxed">
              {created.cloneCommand}
            </pre>
          </label>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => void navigator.clipboard.writeText(created.apiKey)}
            >
              Copiază cheia
            </Button>
            <Link href={`/login?next=/s/${created.store.slug}/admin`}>
              <Button size="sm" variant="outline">
                Autentifică-te în dashboard
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm border border-[var(--border)] bg-[var(--surface)] p-6"
      >
        <h1 className="text-2xl font-semibold tracking-tight">
          Deschide un magazin
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Creezi un magazin din șablon, un cont de administrator și o cheie API
          unică pentru storefront.
        </p>

        <label className="mt-5 flex flex-col gap-1 text-sm">
          Nume magazin
          <Input
            name="storeName"
            value={storeName}
            onChange={(e) => {
              setStoreName(e.target.value);
              if (!slug || slug === slugify(storeName)) {
                setSlug(slugify(e.target.value));
              }
            }}
            required
            minLength={2}
          />
        </label>
        <label className="mt-3 flex flex-col gap-1 text-sm">
          Slug
          <Input
            name="slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            required
            pattern="[a-z][a-z0-9-]*"
          />
        </label>

        <p className="mt-5 text-sm font-medium">Cont administrator</p>
        <label className="mt-2 flex flex-col gap-1 text-sm">
          Nume
          <Input name="name" required />
        </label>
        <label className="mt-3 flex flex-col gap-1 text-sm">
          Email
          <Input name="email" type="email" required />
        </label>
        <label className="mt-3 flex flex-col gap-1 text-sm">
          Parolă
          <Input name="password" type="password" minLength={8} required />
        </label>
        {error && <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
        <Button type="submit" disabled={pending} className="mt-5 w-full">
          {pending ? "Se creează…" : "Creează magazin"}
        </Button>
        <p className="mt-4 text-sm text-[var(--muted)]">
          Ai deja cont?{" "}
          <Link href="/login" className="underline">
            Autentificare
          </Link>
        </p>
      </form>
    </div>
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
