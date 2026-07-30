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
          ← Control plane
        </Link>
        <p className="text-[var(--muted)]">Nu există versiuni de comparat.</p>
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
          ← Control plane
        </Link>
        <h1 className="font-semibold tracking-tight text-3xl">
          Diferențe v{aVersion} → v{bVersion}
        </h1>
        <div className="mt-2 flex flex-wrap gap-2">
          {summary.added > 0 && <Badge tone="ok">{summary.added} adăugate</Badge>}
          {summary.removed > 0 && (
            <Badge tone="warn">{summary.removed} eliminate</Badge>
          )}
          {summary.changed > 0 && (
            <Badge tone="accent">{summary.changed} modificate</Badge>
          )}
          <Badge tone="muted">{summary.unchanged} neschimbate</Badge>
          {changed.length > 0 && (
            <Badge tone={behavioural > 0 ? "warn" : "muted"}>
              {behavioural} cu efect asupra deciziilor
            </Badge>
          )}
        </div>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
        <VersionPicker
          name="a"
          label="De la"
          value={aVersion}
          versions={versions}
          liveVersion={store.deployment?.stableVersion ?? null}
        />
        <VersionPicker
          name="b"
          label="La"
          value={bVersion}
          versions={versions}
          liveVersion={store.deployment?.stableVersion ?? null}
        />
        <Button type="submit" size="sm">
          Compară
        </Button>
        <ExplainDiffButton
          onExplain={explainVersionDiff.bind(null, slug, aVersion, bVersion)}
          disabled={!isAiConfigured() || summary.identical}
          disabledReason={
            summary.identical
              ? "Versiunile sunt identice; nu este nimic de explicat."
              : "Modulul AI nu este configurat (GEMINI_API_KEY lipsește)."
          }
        />
      </form>

      {explanationText && (
        <section className="rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--surface)] p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide">
            Explicație generată de model
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-sm">{explanationText}</p>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Generată din diferențele calculate mai jos, care rămân sursa de
            adevăr. {explanation?.model ?? "model necunoscut"} ·{" "}
            {explanation?.createdAt.toLocaleString("ro-RO")}
          </p>
        </section>
      )}

      {summary.identical ? (
        <p className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-[var(--muted)]">
          Cele două versiuni sunt identice în privința regulilor.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {changed.map((diff) => (
            <DiffCard key={diff.key} diff={diff} />
          ))}
        </ul>
      )}

      {unchanged.length > 0 && (
        <details className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
          <summary className="cursor-pointer text-sm text-[var(--muted)]">
            {unchanged.length}{" "}
            {unchanged.length === 1 ? "regulă neschimbată" : "reguli neschimbate"}
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
}: {
  name: string;
  label: string;
  value: number;
  versions: { version: number; status: string; name: string | null }[];
  liveVersion: number | null;
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
            {version.version === liveVersion ? " · live" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

const KIND_LABEL: Record<RuleDiff["kind"], string> = {
  added: "regulă nouă",
  removed: "regulă eliminată",
  changed: "modificată",
  unchanged: "neschimbată",
};

function DiffCard({ diff }: { diff: RuleDiff }) {
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
          {KIND_LABEL[diff.kind]}
        </Badge>
        {!behavioural && <Badge tone="muted">doar text, fără efect</Badge>}
      </div>

      {diff.kind === "added" && (
        <RuleSummary
          heading="Va fi introdusă"
          name={diff.after.name}
          priority={diff.after.priority}
          category={diff.after.category}
          enabled={diff.after.enabled}
        />
      )}

      {diff.kind === "removed" && (
        <RuleSummary
          heading="Nu va mai exista"
          name={diff.before.name}
          priority={diff.before.priority}
          category={diff.before.category}
          enabled={diff.before.enabled}
        />
      )}

      {diff.kind === "changed" && (
        <>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {diff.after.name} · {diff.after.category}
          </p>
          <ul className="mt-3 flex flex-col gap-3">
            {diff.changes.map((change) => (
              <ChangeRow key={change.field} change={change} />
            ))}
          </ul>
        </>
      )}
    </li>
  );
}

function RuleSummary({
  heading,
  name,
  priority,
  category,
  enabled,
}: {
  heading: string;
  name: string;
  priority: number;
  category: string;
  enabled: boolean;
}) {
  return (
    <p className="mt-1 text-sm text-[var(--muted)]">
      {heading}: <span className="text-[var(--fg)]">{name}</span> · {category} ·
      prioritate {priority} · {enabled ? "activă" : "dezactivată"}
    </p>
  );
}

function renderValue(value: unknown, text?: string): string {
  if (text) return text;
  if (typeof value === "boolean") return value ? "da" : "nu";
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function ChangeRow({ change }: { change: FieldChange }) {
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
    : renderValue(change.before, change.beforeText);
  const after = lossy
    ? JSON.stringify(change.after)
    : renderValue(change.after, change.afterText);

  return (
    <li className="flex flex-col gap-1">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
        {change.label}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded border border-red-300/60 bg-red-500/10 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-red-700">
            înainte
          </p>
          <p className="mt-0.5 break-words text-sm">{before}</p>
        </div>
        <div className="rounded border border-emerald-300/60 bg-emerald-500/10 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-emerald-700">
            după
          </p>
          <p className="mt-0.5 break-words text-sm">{after}</p>
        </div>
      </div>
      {lossy && (
        <p className="text-xs text-[var(--muted)]">
          Descrierea în limbaj natural este identică; se afișează valoarea brută.
        </p>
      )}
    </li>
  );
}
