"use client";

import { useState, useTransition, type FormEvent } from "react";
import { createStoreAction, type CreateStoreResult } from "@/app/actions/stores";
import { useT } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Created = Extract<CreateStoreResult, { ok: true }>;

export function CreateStoreForm() {
  const t = useT();
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
          {t("createStore.created", { name: created.store.name })}
        </h2>
        <p className="text-sm text-[var(--muted)]">
          {t("createStore.adminAccountLabel")}:{" "}
          <code className="text-xs">{created.admin.email}</code>
          {created.adminReused
            ? ` ${t("createStore.existingAccount")}`
            : ` ${t("createStore.newAccount")}`}
          . {t("createStore.apiKeyWarning")}
        </p>
        <label className="flex flex-col gap-1 text-sm">
          {t("createStore.apiKey")}
          <code className="break-all rounded bg-[var(--surface-2)] px-3 py-2 text-xs">
            {created.apiKey}
          </code>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("createStore.dockerCommand")}
          <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-[var(--surface-2)] px-3 py-2 text-xs leading-relaxed">
            {created.cloneCommand}
          </pre>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => void navigator.clipboard.writeText(created.apiKey)}
          >
            {t("createStore.copyKey")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              void navigator.clipboard.writeText(created.cloneCommand)
            }
          >
            {t("createStore.copyDocker")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setCreated(null)}
          >
            {t("createStore.close")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="panel flex flex-col gap-3 p-5">
      <h2 className="text-lg font-semibold">{t("createStore.title")}</h2>
      <p className="text-sm text-[var(--muted)]">{t("createStore.description")}</p>

      <label className="flex flex-col gap-1 text-sm">
        {t("createStore.storeName")}
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
        {t("createStore.slug")}
        <Input
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase())}
          required
          pattern="[a-z][a-z0-9-]*"
        />
      </label>

      <div className="mt-2 border-t border-[var(--border)] pt-3">
        <p className="mb-2 text-sm font-medium">{t("createStore.admin")}</p>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            {t("createStore.name")}
            <Input
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("createStore.email")}
            <Input
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("createStore.password")}
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
        {pending ? t("createStore.creating") : t("createStore.submit")}
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
