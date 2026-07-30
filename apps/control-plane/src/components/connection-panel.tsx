"use client";

import { useState, useTransition } from "react";
import { rotateStoreKeyAction } from "@/app/actions/stores";
import { useT } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";

const STOREFRONT_ORIGIN = "http://localhost:3008";

function placeholderDocker(
  apiUrl: string,
  image: string,
  apiKey = "<cheia-ta>",
) {
  const run = [
    "docker run --rm -p 3008:80",
    `-e RULESHOP_API_URL=${apiUrl}`,
    `-e RULESHOP_API_KEY=${apiKey}`,
    image,
  ].join(" ");
  return `docker pull ${image} && ${run}`;
}

export function ConnectionPanel({
  slug,
  apiUrl,
  degitSource,
  storefrontImage,
  keys,
}: {
  slug: string;
  apiUrl: string;
  degitSource: string;
  storefrontImage: string;
  keys: { id: string; name: string; keyPrefix: string; createdAt: Date }[];
}) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [dockerCommand, setDockerCommand] = useState<string | null>(null);
  const [degitCommand, setDegitCommand] = useState<string | null>(null);
  const [copied, setCopied] = useState<"docker" | "key" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = keys[0];
  const displayDocker =
    dockerCommand ??
    placeholderDocker(apiUrl, storefrontImage, freshKey ?? undefined);

  async function copy(text: string, which: "docker" | "key") {
    await navigator.clipboard.writeText(text);
    setCopied(which);
    window.setTimeout(() => setCopied(null), 2000);
  }

  function onRotate() {
    setError(null);
    startTransition(async () => {
      const result = await rotateStoreKeyAction(slug);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setFreshKey(result.apiKey);
      setDockerCommand(result.cloneCommand);
      setDegitCommand(result.degitCommand);
    });
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="panel flex flex-col gap-3 p-5">
        <h2 className="text-lg font-semibold">{t("connection.apiKeyTitle")}</h2>
        <p className="text-sm text-[var(--muted)]">{t("connection.apiKeyHelp")}</p>
        {active ? (
          <p className="text-sm">
            {t("connection.active")}{" "}
            <code className="rounded bg-[var(--surface-2)] px-2 py-0.5 text-xs">
              {active.keyPrefix}…
            </code>{" "}
            <span className="text-[var(--muted)]">
              ({active.createdAt.toLocaleString("ro-RO")})
            </span>
          </p>
        ) : (
          <p className="text-sm text-[var(--warn)]">{t("connection.noKey")}</p>
        )}

        {freshKey && (
          <div className="flex flex-col gap-2 rounded border border-[var(--border)] bg-[var(--surface-2)] p-3">
            <p className="text-sm font-medium">{t("connection.freshKey")}</p>
            <code className="break-all text-xs">{freshKey}</code>
            <Button
              type="button"
              size="sm"
              className="self-start"
              onClick={() => void copy(freshKey, "key")}
            >
              {copied === "key" ? t("common.copied") : t("connection.copyKey")}
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
          {pending ? t("connection.rotating") : t("connection.rotate")}
        </Button>
        {!freshKey && (
          <p className="text-xs text-[var(--muted)]">{t("connection.rotateHint")}</p>
        )}
      </div>

      <div className="panel flex flex-col gap-3 p-5">
        <h2 className="text-lg font-semibold">{t("connection.startTitle")}</h2>
        <p className="text-sm text-[var(--muted)]">
          {t("connection.startHelp", {
            storefront: STOREFRONT_ORIGIN,
            api: apiUrl,
          })}
        </p>
        <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-[var(--surface-2)] px-3 py-2 text-xs leading-relaxed">
          {displayDocker}
        </pre>
        <Button
          type="button"
          size="sm"
          className="self-start"
          disabled={!freshKey && !dockerCommand}
          title={
            !freshKey && !dockerCommand
              ? t("connection.needRotateTitle")
              : undefined
          }
          onClick={() => void copy(displayDocker, "docker")}
        >
          {copied === "docker" ? t("common.copied") : t("connection.copyDocker")}
        </Button>
        {!freshKey && !dockerCommand && (
          <p className="text-xs text-[var(--muted)]">
            {t("connection.placeholderHint")}
          </p>
        )}
      </div>

      {degitCommand && (
        <details className="panel p-5 text-sm">
          <summary className="cursor-pointer font-medium">
            {t("connection.degitAlt")}
          </summary>
          <pre className="mt-3 overflow-x-auto rounded bg-[var(--surface-2)] px-3 py-2 text-xs leading-relaxed">
            {degitCommand}
          </pre>
          <p className="mt-2 text-xs text-[var(--muted)]">
            {t("connection.source")} <code>{degitSource}</code>
          </p>
        </details>
      )}
    </div>
  );
}
