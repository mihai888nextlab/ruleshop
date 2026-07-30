"use client";

import { useState } from "react";
import {
  BODY_FONTS,
  COLOR_LABELS,
  DISPLAY_FONTS,
  themeToCssVars,
  type ThemeColors,
  type ThemeTokens,
} from "@ruleshop/contracts";
import { useT } from "@/components/i18n-provider";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ThemePreview } from "./theme-preview";

/**
 * Theme composer.
 *
 * Every control edits one token, and the preview beside it renders using exactly
 * the CSS variables the storefront will apply — so what an administrator approves
 * here is what a customer gets, rather than an approximation drawn by a separate
 * component.
 */

/** Grouped so the panel reads as design decisions, not a flat list of fields. */
const COLOR_GROUP_KEYS: {
  labelKey:
    | "themes.colorBase"
    | "themes.colorSurfaces"
    | "themes.colorAccent"
    | "themes.colorSignals";
  keys: (keyof ThemeColors)[];
}[] = [
  { labelKey: "themes.colorBase", keys: ["bg", "fg", "muted"] },
  { labelKey: "themes.colorSurfaces", keys: ["surface", "surface2", "border"] },
  { labelKey: "themes.colorAccent", keys: ["accent", "accentFg"] },
  { labelKey: "themes.colorSignals", keys: ["positive", "warning", "danger"] },
];

export function ThemeEditor({
  initialKey,
  initialName,
  initialTokens,
  isNew,
  onSave,
  onCancel,
  onUploadHero,
}: {
  initialKey: string;
  initialName: string;
  initialTokens: ThemeTokens;
  isNew: boolean;
  onSave: (input: {
    key: string;
    name: string;
    tokens: ThemeTokens;
  }) => Promise<unknown>;
  onCancel?: () => void;
  /** Uploads via FormData (`image` file field) and returns `/uploads/...`. */
  onUploadHero: (formData: FormData) => Promise<string>;
}) {
  const t = useT();
  const [key, setKey] = useState(initialKey);
  const [name, setName] = useState(initialName);
  const [tokens, setTokens] = useState<ThemeTokens>(initialTokens);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  function patch(next: Partial<ThemeTokens>) {
    setSaved(false);
    setTokens((current) => ({ ...current, ...next }));
  }

  function patchColor(colorKey: keyof ThemeColors, value: string) {
    setSaved(false);
    setTokens((current) => ({
      ...current,
      colors: { ...current.colors, [colorKey]: value },
    }));
  }

  async function onHeroFile(file: File | undefined) {
    if (!file) return;
    setError("");
    setUploading(true);
    setLocalPreview(URL.createObjectURL(file));
    try {
      const fd = new FormData();
      fd.set("image", file);
      const path = await onUploadHero(fd);
      patch({ heroImage: path });
      setLocalPreview(null);
    } catch (cause) {
      setLocalPreview(null);
      setError(
        cause instanceof Error ? cause.message : t("themes.uploadFailed"),
      );
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setError("");
    setPending(true);
    try {
      await onSave({ key: key.trim(), name: name.trim(), tokens });
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("themes.saveFailed"));
    } finally {
      setPending(false);
    }
  }

  const labelClass = "flex flex-col gap-1 text-sm";
  const heroSrc = localPreview ?? tokens.heroImage;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start">
      <div className="flex flex-col gap-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelClass}>
            <span className="font-medium">{t("themes.name")}</span>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={60}
              placeholder={t("themes.namePlaceholder")}
            />
          </label>

          <label className={labelClass}>
            <span className="font-medium">{t("themes.key")}</span>
            <Input
              value={key}
              onChange={(event) => setKey(event.target.value)}
              disabled={!isNew}
              pattern="[a-z][a-z0-9-]*"
              placeholder={t("themes.keyPlaceholder")}
            />
            <span className="text-xs text-[var(--muted)]">
              {isNew ? t("themes.keyHintNew") : t("themes.keyHintLocked")}
            </span>
          </label>
        </div>

        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            {t("themes.hero")}
          </h3>
          <p className="text-xs text-[var(--muted)]">{t("themes.heroHelp")}</p>
          {heroSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={heroSrc}
              alt=""
              className="h-28 w-full rounded-[var(--radius)] border border-[var(--border)] object-cover"
            />
          )}
          <Input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            disabled={uploading || pending}
            onChange={(event) => {
              void onHeroFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          {tokens.heroImage && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              disabled={uploading || pending}
              onClick={() => {
                setLocalPreview(null);
                patch({ heroImage: null });
              }}
            >
              {t("themes.removeImage")}
            </Button>
          )}
          {uploading && (
            <p className="text-xs text-[var(--muted)]">{t("common.loading")}</p>
          )}
          <RangeRow
            label={t("themes.overlay")}
            value={tokens.heroOverlay}
            min={0}
            max={1}
            step={0.05}
            display={`${Math.round(tokens.heroOverlay * 100)}%`}
            onChange={(value) =>
              patch({ heroOverlay: Number(value.toFixed(2)) })
            }
          />
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            {t("themes.colors")}
          </h3>
          {COLOR_GROUP_KEYS.map((group) => (
            <div key={group.labelKey} className="flex flex-col gap-2">
              <p className="text-xs text-[var(--muted)]">{t(group.labelKey)}</p>
              {group.keys.map((colorKey) => (
                <ColorRow
                  key={colorKey}
                  label={COLOR_LABELS[colorKey]}
                  value={tokens.colors[colorKey]}
                  onChange={(value) => patchColor(colorKey, value)}
                />
              ))}
            </div>
          ))}
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            {t("themes.typography")}
          </h3>

          <label className={labelClass}>
            <span>{t("themes.displayFont")}</span>
            <select
              value={tokens.fontDisplay}
              onChange={(event) =>
                patch({
                  fontDisplay: event.target
                    .value as ThemeTokens["fontDisplay"],
                })
              }
              className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            >
              {Object.entries(DISPLAY_FONTS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className={labelClass}>
            <span>{t("themes.bodyFont")}</span>
            <select
              value={tokens.fontBody}
              onChange={(event) =>
                patch({ fontBody: event.target.value as ThemeTokens["fontBody"] })
              }
              className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            >
              {Object.entries(BODY_FONTS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <RangeRow
            label={t("themes.headingWeight")}
            value={tokens.displayWeight}
            min={300}
            max={900}
            step={100}
            display={String(tokens.displayWeight)}
            onChange={(value) => patch({ displayWeight: value })}
          />

          <RangeRow
            label={t("themes.headingTracking")}
            value={tokens.displayTracking}
            min={-0.06}
            max={0.12}
            step={0.01}
            display={`${tokens.displayTracking.toFixed(2)}em`}
            onChange={(value) =>
              patch({ displayTracking: Number(value.toFixed(2)) })
            }
          />
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            {t("themes.shapeRhythm")}
          </h3>

          <RangeRow
            label={t("themes.radius")}
            value={tokens.radius}
            min={0}
            max={24}
            step={1}
            display={`${tokens.radius}px`}
            onChange={(value) => patch({ radius: Math.round(value) })}
          />

          <div className="flex flex-col gap-1 text-sm">
            <span>{t("themes.density")}</span>
            <div className="flex gap-2">
              {(
                [
                  ["compact", "themes.densityCompact"],
                  ["regular", "themes.densityRegular"],
                  ["airy", "themes.densityAiry"],
                ] as const
              ).map(([option, labelKey]) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => patch({ density: option })}
                  className={
                    "rounded-[var(--radius)] border px-3 py-1.5 text-xs transition " +
                    (tokens.density === option
                      ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]"
                      : "border-[var(--border)] hover:border-[var(--accent)]")
                  }
                >
                  {t(labelKey)}
                </button>
              ))}
            </div>
          </div>
        </section>

        {error && (
          <p
            role="alert"
            className="rounded-[var(--radius)] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]"
          >
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={save} disabled={pending || uploading}>
            {pending
              ? t("common.saving")
              : isNew
                ? t("themes.create")
                : t("common.save")}
          </Button>
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              {t("common.cancel")}
            </Button>
          )}
          {saved && (
            <span className="text-sm text-emerald-700">{t("themes.savedHint")}</span>
          )}
        </div>
      </div>

      <div className="lg:sticky lg:top-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          {t("themes.preview")}
        </p>
        <ThemePreview tokens={tokens} storeName={name || t("nav.store")} />
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-[var(--muted)]">
            {t("themes.cssVars")}
          </summary>
          <pre className="mt-2 max-h-56 overflow-auto rounded bg-[var(--surface-2)] p-2 text-xs">
            {Object.entries(themeToCssVars(tokens))
              .map(([property, value]) => `${property}: ${value};`)
              .join("\n")}
          </pre>
        </details>
      </div>
    </div>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-3 text-sm">
      <input
        type="color"
        value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className="h-8 w-10 shrink-0 cursor-pointer rounded border border-[var(--border)] bg-transparent"
      />
      <span className="flex-1">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        maxLength={7}
        className="w-24 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-2 py-1 font-mono text-xs"
      />
    </label>
  );
}

function RangeRow({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="flex justify-between">
        {label}
        <span className="text-[var(--muted)]">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="accent-[var(--accent)]"
      />
    </label>
  );
}
