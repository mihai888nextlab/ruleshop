"use client";

import { useState, useTransition } from "react";
import { rotateStoreKeyAction } from "@/app/actions/stores";
import { Button } from "@/components/ui/button";

function placeholderClone(apiUrl: string, degitSource: string, apiKey?: string) {
  return [
    `npx degit ${degitSource} my-store`,
    `cd my-store`,
    `cp .env.example .env`,
    `# VITE_RULESHOP_API_URL=${apiUrl}`,
    `# VITE_RULESHOP_API_KEY=${apiKey ?? "<cheia-ta>"}`,
    `npm i && npm run dev`,
  ].join("\n");
}

export function ConnectionPanel({
  slug,
  apiUrl,
  degitSource,
  keys,
}: {
  slug: string;
  apiUrl: string;
  degitSource: string;
  keys: { id: string; name: string; keyPrefix: string; createdAt: Date }[];
}) {
  const [pending, startTransition] = useTransition();
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [cloneCommand, setCloneCommand] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = keys[0];
  const displayCommand =
    cloneCommand ??
    placeholderClone(apiUrl, degitSource, freshKey ?? undefined);

  function onRotate() {
    setError(null);
    startTransition(async () => {
      const result = await rotateStoreKeyAction(slug);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setFreshKey(result.apiKey);
      setCloneCommand(result.cloneCommand);
    });
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="panel flex flex-col gap-3 p-5">
        <h2 className="text-lg font-semibold">Cheie API storefront</h2>
        <p className="text-sm text-[var(--muted)]">
          Storefront-ul Vite trimite această cheie pe fiecare cerere. Nu
          încredința niciodată un storeId din client.
        </p>
        {active ? (
          <p className="text-sm">
            Activă:{" "}
            <code className="rounded bg-[var(--surface-2)] px-2 py-0.5 text-xs">
              {active.keyPrefix}…
            </code>{" "}
            <span className="text-[var(--muted)]">
              ({active.createdAt.toLocaleString("ro-RO")})
            </span>
          </p>
        ) : (
          <p className="text-sm text-[var(--warning)]">Nicio cheie activă.</p>
        )}

        {freshKey && (
          <div className="flex flex-col gap-2 rounded border border-[var(--border)] bg-[var(--surface-2)] p-3">
            <p className="text-sm font-medium">Cheie nouă (copiază acum)</p>
            <code className="break-all text-xs">{freshKey}</code>
            <Button
              type="button"
              size="sm"
              className="self-start"
              onClick={() => void navigator.clipboard.writeText(freshKey)}
            >
              Copiază cheia
            </Button>
          </div>
        )}

        {error && (
          <p className="text-sm text-[var(--danger)]" role="alert">
            {error}
          </p>
        )}

        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onRotate}
          className="self-start"
        >
          {pending ? "Se regeneră…" : "Regenerează cheia"}
        </Button>
      </div>

      <div className="panel flex flex-col gap-3 p-5">
        <h2 className="text-lg font-semibold">Clone storefront</h2>
        <pre className="overflow-x-auto rounded bg-[var(--surface-2)] px-3 py-2 text-xs leading-relaxed">
          {displayCommand}
        </pre>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="self-start"
          onClick={() => void navigator.clipboard.writeText(displayCommand)}
        >
          Copiază comanda
        </Button>
      </div>
    </div>
  );
}
