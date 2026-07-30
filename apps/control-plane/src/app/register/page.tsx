"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { openStoreAction, type CreateStoreResult } from "@/app/actions/stores";
import { useT } from "@/components/i18n-provider";
import { PreferencesControls } from "@/components/preferences-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Created = Extract<CreateStoreResult, { ok: true }>;

export default function RegisterPage() {
  const t = useT();
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
            {t("register.ready", { name: created.store.name })}
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {t("register.adminAccountLabel")}{" "}
            <code className="text-xs">{created.admin.email}</code>.{" "}
            {t("register.apiKeyWarning")}
          </p>
          <label className="mt-5 flex flex-col gap-1 text-sm">
            {t("register.apiKey")}
            <code className="break-all rounded bg-[var(--surface-2)] px-3 py-2 text-xs">
              {created.apiKey}
            </code>
          </label>
          <label className="mt-3 flex flex-col gap-1 text-sm">
            {t("register.dockerCommand")}
            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-[var(--surface-2)] px-3 py-2 text-xs leading-relaxed">
              {created.cloneCommand}
            </pre>
          </label>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => void navigator.clipboard.writeText(created.apiKey)}
            >
              {t("register.copyKey")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                void navigator.clipboard.writeText(created.cloneCommand)
              }
            >
              {t("register.copyDocker")}
            </Button>
            <Link href={`/login?next=/s/${created.store.slug}/admin`}>
              <Button size="sm" variant="ghost">
                {t("register.signInDashboard")}
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
        <div className="mb-4 flex justify-end">
          <PreferencesControls />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("register.title")}
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)]">{t("register.intro")}</p>

        <label className="mt-5 flex flex-col gap-1 text-sm">
          {t("register.storeName")}
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
          {t("register.slug")}
          <Input
            name="slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            required
            pattern="[a-z][a-z0-9-]*"
          />
        </label>

        <p className="mt-5 text-sm font-medium">{t("register.adminAccount")}</p>
        <label className="mt-2 flex flex-col gap-1 text-sm">
          {t("auth.name")}
          <Input name="name" required />
        </label>
        <label className="mt-3 flex flex-col gap-1 text-sm">
          {t("auth.email")}
          <Input name="email" type="email" required />
        </label>
        <label className="mt-3 flex flex-col gap-1 text-sm">
          {t("auth.password")}
          <Input name="password" type="password" minLength={8} required />
        </label>
        {error && <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
        <Button type="submit" disabled={pending} className="mt-5 w-full">
          {pending ? t("register.creating") : t("register.submit")}
        </Button>
        <p className="mt-4 text-sm text-[var(--muted)]">
          {t("register.haveAccount")}{" "}
          <Link href="/login" className="underline">
            {t("common.signIn")}
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
