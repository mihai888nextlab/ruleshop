import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  diffRulesets,
  hasBehaviouralChange,
  summarizeDiff,
  type FieldChange,
  type RuleDiff,
} from "@ruleshop/engine";
import { explainVersionDiff } from "@/app/actions/ai";
import { ExplainDiffButton } from "@/components/ai/explain-diff-button";
import { isAiConfigured } from "@/lib/ai";
import { requireStoreRole } from "@/lib/auth";
import { loadContextSchema } from "@/lib/context-schema";
import { toRuleDefs } from "@/lib/decide";
import { prisma } from "@/lib/prisma";
import { getStoreBySlug } from "@/lib/store";
import type { TranslateFn } from "@/i18n/dictionary";
import { getTranslator } from "@/i18n/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * Version comparison.
 *
 * Publishing is a customer-facing act, so the review screen has to say precisely
 * what changes — per rule and per field, with conditions rendered in words. Two
 * JSON blobs side by side contain the same information but do not let anyone
 * actually check it.
 */
export default async function DiffPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const t = await getTranslator();

  const store = await getStoreBySlug(slug);
  if (!store) notFound();
  const authz = await requireStoreRole(store.id, "OPERATOR");
  if (!authz.ok) redirect(`/login?next=/s/${slug}/rules/diff`);

  const versions = await prisma.ruleset.findMany({
    where: { storeId: store.id },
    select: { version: true, status: true, name: true },
    orderBy: { version: "desc" },
  });

  if (versions.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <Link href={`/s/${slug}/rules`} className="text-sm text-[var(--muted)]">
          {t("common.backControlPlane")}
        </Link>
        <p className="text-[var(--muted)]">{t("diff.noVersions")}</p>
      </div>
    );
  }

  // Defaults answer the question an operator usually has: what would change if I
  // published the newest version over what is live?
  const live = store.deployment?.stableVersion ?? versions.at(-1)!.version;
  const newest = versions[0]!.version;

  const aVersion = clampVersion(query.a, live, versions);
  const bVersion = clampVersion(query.b, newest, versions);

  const [a, b, schema] = await Promise.all([
    prisma.ruleset.findUnique({
      where: { storeId_version: { storeId: store.id, version: aVersion } },
      include: { rules: true },
    }),
    prisma.ruleset.findUnique({
      where: { storeId_version: { storeId: store.id, version: bVersion } },
      include: { rules: true },
    }),
    loadContextSchema(store.id),
  ]);

  const diffs = diffRulesets(
    a ? toRuleDefs(a.rules) : [],
    b ? toRuleDefs(b.rules) : [],
    schema,
  );
  const summary = summarizeDiff(diffs);
  const changed = diffs.filter((d) => d.kind !== "unchanged");
  const unchanged = diffs.filter((d) => d.kind === "unchanged");
  const behavioural = changed.filter(hasBehaviouralChange).length;

  // The most recent explanation for exactly this pair, if one was ever asked for.
  // Keyed on the prompt this application wrote, so it cannot match a different
  // comparison.
  const explanation = await prisma.aiSuggestion.findFirst({
    where: {
      storeId: store.id,
      kind: "diff_explanation",
      prompt: `diff:v${aVersion}->v${bVersion}`,
    },
    orderBy: { createdAt: "desc" },
    select: { proposal: true, createdAt: true, model: true },
  });

  const explanationText = (() => {
    const proposal = (explanation?.proposal ?? {}) as { explanation?: unknown };
    return typeof proposal.explanation === "string" ? proposal.explanation : null;
  })();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/s/${slug}/rules`} className="text-sm text-[var(--muted)]">
          {t("common.backControlPlane")}
        </Link>
        <h1 className="font-semibold tracking-tight text-3xl">
          {t("diff.title", { from: aVersion, to: bVersion })}
        </h1>
        <div className="mt-2 flex flex-wrap gap-2">
          {summary.added > 0 && (
            <Badge tone="ok">
              {summary.added} {t("diff.added")}
            </Badge>
          )}
          {summary.removed > 0 && (
            <Badge tone="warn">
              {summary.removed} {t("diff.removed")}
            </Badge>
          )}
          {summary.changed > 0 && (
            <Badge tone="accent">
              {summary.changed} {t("diff.changed")}
            </Badge>
          )}
          <Badge tone="muted">
            {t("diff.unchangedBadge", { n: summary.unchanged })}
          </Badge>
          {changed.length > 0 && (
            <Badge tone={behavioural > 0 ? "warn" : "muted"}>
              {t("diff.behaviouralBadge", { n: behavioural })}
            </Badge>
          )}
        </div>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
        <VersionPicker
          name="a"
          label={t("diff.from")}
          value={aVersion}
          versions={versions}
          liveVersion={store.deployment?.stableVersion ?? null}
          liveSuffix={t("diff.liveSuffix")}
        />
        <VersionPicker
          name="b"
          label={t("diff.to")}
          value={bVersion}
          versions={versions}
          liveVersion={store.deployment?.stableVersion ?? null}
          liveSuffix={t("diff.liveSuffix")}
        />
        <Button type="submit" size="sm">
          {t("diff.compare")}
        </Button>
        <ExplainDiffButton
          onExplain={explainVersionDiff.bind(null, slug, aVersion, bVersion)}
          disabled={!isAiConfigured() || summary.identical}
          disabledReason={
            summary.identical
              ? t("diff.nothingToExplain")
              : t("diff.aiNotConfigured")
          }
        />
      </form>

      {explanationText && (
        <section className="rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--surface)] p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide">
            {t("ai.modelExplanation")}
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-sm">{explanationText}</p>
          <p className="mt-2 text-xs text-[var(--muted)]">
            {t("diff.explanationFooter")}{" "}
            {explanation?.model ?? "model necunoscut"} ·{" "}
            {explanation?.createdAt.toLocaleString()}
          </p>
        </section>
      )}

      {summary.identical ? (
        <p className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-[var(--muted)]">
          {t("diff.identicalRules")}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {changed.map((diff) => (
            <DiffCard key={diff.key} diff={diff} t={t} />
          ))}
        </ul>
      )}

      {unchanged.length > 0 && (
        <details className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
          <summary className="cursor-pointer text-sm text-[var(--muted)]">
            {unchanged.length}{" "}
            {unchanged.length === 1
              ? t("diff.unchangedRuleOne")
              : t("diff.unchangedRulesMany")}
          </summary>
          <ul className="mt-3 flex flex-col gap-1">
            {unchanged.map((diff) => (
              <li key={diff.key} className="text-sm text-[var(--muted)]">
                {diff.key}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Falls back to a sensible default rather than trusting a query parameter. */
function clampVersion(
  raw: string | undefined,
  fallback: number,
  versions: { version: number }[],
): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) return fallback;
  return versions.some((v) => v.version === parsed) ? parsed : fallback;
}

function VersionPicker({
  name,
  label,
  value,
  versions,
  liveVersion,
  liveSuffix,
}: {
  name: string;
  label: string;
  value: number;
  versions: { version: number; status: string; name: string | null }[];
  liveVersion: number | null;
  liveSuffix: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <select
        name={name}
        defaultValue={value}
        className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
      >
        {versions.map((version) => (
          <option key={version.version} value={version.version}>
            v{version.version} · {version.status}
            {version.version === liveVersion ? liveSuffix : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

function kindLabel(kind: RuleDiff["kind"], t: TranslateFn): string {
  switch (kind) {
    case "added":
      return t("diff.newRule");
    case "removed":
      return t("diff.ruleRemovedKind");
    case "changed":
      return t("diff.changedKind");
    default:
      return t("diff.unchangedKind");
  }
}

function DiffCard({ diff, t }: { diff: RuleDiff; t: TranslateFn }) {
  const behavioural = hasBehaviouralChange(diff);

  const accent =
    diff.kind === "added"
      ? "border-l-emerald-500"
      : diff.kind === "removed"
        ? "border-l-red-500"
        : "border-l-amber-500";

  return (
    <li
      className={`rounded-[var(--radius)] border border-[var(--border)] border-l-4 bg-[var(--surface)] p-4 ${accent}`}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="font-medium">{diff.key}</p>
        <Badge
          tone={
            diff.kind === "added"
              ? "ok"
              : diff.kind === "removed"
                ? "warn"
                : "accent"
          }
        >
          {kindLabel(diff.kind, t)}
        </Badge>
        {!behavioural && <Badge tone="muted">{t("diff.textOnly")}</Badge>}
      </div>

      {diff.kind === "added" && (
        <RuleSummary
          t={t}
          heading={t("diff.willIntroduce")}
          name={diff.after.name}
          priority={diff.after.priority}
          category={diff.after.category}
          enabled={diff.after.enabled}
        />
      )}

      {diff.kind === "removed" && (
        <RuleSummary
          t={t}
          heading={t("diff.willRemove")}
          name={diff.before.name}
          priority={diff.before.priority}
          category={diff.before.category}
          enabled={diff.before.enabled}
        />
      )}

      {diff.kind === "changed" && (
        <>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {diff.after.name} · {t(`rules.categories.${diff.after.category}` as "rules.categories.pricing")}
          </p>
          <ul className="mt-3 flex flex-col gap-3">
            {diff.changes.map((change) => (
              <ChangeRow key={change.field} change={change} t={t} />
            ))}
          </ul>
        </>
      )}
    </li>
  );
}

function RuleSummary({
  t,
  heading,
  name,
  priority,
  category,
  enabled,
}: {
  t: TranslateFn;
  heading: string;
  name: string;
  priority: number;
  category: string;
  enabled: boolean;
}) {
  const categoryLabel = t(
    `rules.categories.${category}` as "rules.categories.pricing",
  );
  return (
    <p className="mt-1 text-sm text-[var(--muted)]">
      {heading}: <span className="text-[var(--fg)]">{name}</span> ·{" "}
      {categoryLabel} · {t("diff.priorityLine", { priority })} ·{" "}
      {enabled ? t("diff.active") : t("diff.disabled")}
    </p>
  );
}

function renderValue(
  value: unknown,
  t: TranslateFn,
  text?: string,
): string {
  if (text) return text;
  if (typeof value === "boolean") return value ? t("common.yes") : t("common.no");
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function ChangeRow({ change, t }: { change: FieldChange; t: TranslateFn }) {
  /**
   * A human rendering can be lossy — two different actions may describe
   * identically. When that happens the summary would show the same text on both
   * sides and hide a real change, so fall back to the raw values, which are what
   * the comparison actually found to differ.
   */
  const lossy =
    change.beforeText !== undefined &&
    change.beforeText === change.afterText;

  const before = lossy
    ? JSON.stringify(change.before)
    : renderValue(change.before, t, change.beforeText);
  const after = lossy
    ? JSON.stringify(change.after)
    : renderValue(change.after, t, change.afterText);

  return (
    <li className="flex flex-col gap-1">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
        {change.label}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-2 text-[var(--danger)]">
          <p className="text-[10px] uppercase tracking-wide text-red-700">
            {t("diff.before")}
          </p>
          <p className="mt-0.5 break-words text-sm">{before}</p>
        </div>
        <div className="rounded border border-emerald-300/60 bg-emerald-500/10 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-emerald-700">
            {t("diff.after")}
          </p>
          <p className="mt-0.5 break-words text-sm">{after}</p>
        </div>
      </div>
      {lossy && (
        <p className="text-xs text-[var(--muted)]">{t("diff.lossyNote")}</p>
      )}
    </li>
  );
}
