import OpenAI from "openai";
import {
  OPERATORS_BY_TYPE,
  describeConditionWith,
  validateRule,
  type ContextSchema,
  type DecisionType,
  type FieldDef,
  type RuleDefinition,
  type RuleDiff,
  type RuleFinding,
  type RuleImpact,
  type RulesetAnalysis,
  type SimulationResult,
} from "@ruleshop/engine";
import type { FraudStats } from "./fraud-analysis";

/**
 * The AI module's boundary with the language model.
 *
 * Two rules shape everything here. First, statistics are never asked of the
 * model: findings and metrics are computed by this application, and the model is
 * only asked to put them into words. Second, anything the model produces that
 * will be stored is validated against the store's own schema before being
 * accepted, so an invented field or operator is rejected rather than saved.
 *
 * Every call returns a tagged result. The AI assists a workflow that has to keep
 * working without it, so an unset key or a failed request degrades to "no
 * narrative" rather than breaking the page.
 */

/**
 * Bumped whenever a prompt changes materially. Stored with each suggestion, so an
 * old result stays interpretable against the prompt that produced it.
 */
export const PROMPT_VERSION = "2026-07-30.2";

export interface ModelCall {
  content: string;
  model: string;
  latencyMs: number;
  tokensPrompt: number | null;
  tokensOutput: number | null;
}

export type AiResult<T> =
  | { ok: true; data: T; call: ModelCall }
  | { ok: false; error: string; call: ModelCall | null };

export function isAiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

function client(): OpenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY lipsește din mediu");
  // Gemini's OpenAI-compatible endpoint keeps the same chat.completions shape
  // we already use for extraction / narration.
  return new OpenAI({
    apiKey,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    // A rule author is waiting on this; failing fast beats a hung page.
    timeout: 45_000,
    // 429s on free tier are common; a couple of retries help brief rate windows.
    maxRetries: 2,
  });
}

function modelName(): string {
  // gemini-2.0-flash often has free-tier quota 0 for new keys; the "latest"
  // flash alias tracks a model that still accepts free traffic.
  return process.env.GEMINI_MODEL || "gemini-flash-latest";
}

function formatModelError(cause: unknown): string {
  if (!cause || typeof cause !== "object") {
    return "Apelul către model a eșuat";
  }

  const err = cause as {
    status?: number;
    message?: string;
    error?: { message?: string; code?: number | string };
  };
  const status = err.status;
  const detail =
    (typeof err.error?.message === "string" && err.error.message) ||
    (typeof err.message === "string" ? err.message : "");

  if (status === 429 || /\b429\b/.test(detail)) {
    return (
      `Cotă Gemini epuizată sau limită de rată (429) pe modelul „${modelName()}”. ` +
      `Încearcă din nou peste un minut, setează GEMINI_MODEL=gemini-flash-latest, ` +
      `sau verifică billing/quota la https://ai.dev/rate-limit.`
    );
  }

  if (status === 404 || /not found|no longer available/i.test(detail)) {
    return (
      `Modelul „${modelName()}” nu este disponibil pentru această cheie. ` +
      `Schimbă GEMINI_MODEL (ex. gemini-flash-latest).`
    );
  }

  if (status === 401 || status === 403) {
    return "Cheia GEMINI_API_KEY este invalidă sau fără acces. Verifică cheia în Google AI Studio.";
  }

  if (detail && detail !== "429 status code (no body)") {
    return `Apelul către model a eșuat: ${detail}`;
  }

  return status
    ? `Apelul către model a eșuat (HTTP ${status})`
    : "Apelul către model a eșuat";
}

async function callModel(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  options: { temperature?: number } = {},
): Promise<AiResult<string>> {
  if (!isAiConfigured()) {
    return {
      ok: false,
      error:
        "Modulul AI nu este configurat (GEMINI_API_KEY lipsește). Analiza statistică rămâne disponibilă.",
      call: null,
    };
  }

  const startedAt = Date.now();
  try {
    const response = await client().chat.completions.create({
      model: modelName(),
      messages,
      // Low temperature: this is extraction and explanation, not creative work.
      temperature: options.temperature ?? 0.2,
    });

    const content = response.choices[0]?.message?.content ?? "";
    const call: ModelCall = {
      content,
      model: response.model || modelName(),
      latencyMs: Date.now() - startedAt,
      tokensPrompt: response.usage?.prompt_tokens ?? null,
      tokensOutput: response.usage?.completion_tokens ?? null,
    };

    if (!content.trim()) {
      return { ok: false, error: "Modelul a răspuns fără conținut", call };
    }

    return { ok: true, data: content, call };
  } catch (cause) {
    return {
      ok: false,
      error: formatModelError(cause),
      call: {
        content: "",
        model: modelName(),
        latencyMs: Date.now() - startedAt,
        tokensPrompt: null,
        tokensOutput: null,
      },
    };
  }
}

/** Extracts the first JSON object from a reply that may be fenced or prefaced. */
export function extractJson<T = unknown>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1] ?? text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

/**
 * Renders the store's vocabulary for the prompt.
 *
 * The model is told exactly which fields exist, their types, and the operators
 * each type permits. Without this it invents plausible field names and every
 * proposal is then rejected by validation for no useful reason.
 */
function describeSchemaForPrompt(
  schema: ContextSchema,
  category: DecisionType,
): string {
  return schema.fields
    .filter((field) => !field.availableIn || field.availableIn.includes(category))
    .map((field: FieldDef) => {
      const operators = OPERATORS_BY_TYPE[field.type].join("|");
      const options = field.options?.length
        ? ` valori permise: ${field.options.join(", ")}`
        : "";
      return `- ${field.path} (${field.type}) operatori: ${operators}${options}`;
    })
    .join("\n");
}

function findingLine(finding: RuleFinding): string {
  const related = finding.relatedKey ? ` (vs ${finding.relatedKey})` : "";
  return `- [${finding.code}] ${finding.key}${related}: ${finding.message}`;
}

function money(value: number): string {
  return `${value.toFixed(2)} RON`;
}

/** One measured rule, as a line the model can only restate. */
function impactLine(impact: RuleImpact): string {
  return (
    `- ${impact.key} (${impact.category}): ${impact.matched} potriviri, ` +
    `${impact.decisionsChanged} decizii schimbate, venit ${money(impact.revenueDelta)}, ` +
    `cost reduceri ${money(impact.discountCostDelta)}, verdict ${impact.verdict}`
  );
}

// ---------------------------------------------------------------------------
// Narrating analysis the application computed
// ---------------------------------------------------------------------------

export async function narrateAnalysis(
  analysis: RulesetAnalysis,
): Promise<AiResult<string>> {
  const findings = analysis.findings.map(findingLine).join("\n");
  const usage = analysis.usage
    .map((u) => `- ${u.key}: ${u.matched} potriviri, ${u.won} câștigate`)
    .join("\n");
  const impacts = analysis.impacts.map(impactLine).join("\n");

  return callModel([
    {
      role: "system",
      content: `Ești analist pentru RuleShop, o platformă de reguli pentru magazine online.
Primești constatări și statistici DEJA CALCULATE de aplicație. Sarcina ta este să le explici în română, pe scurt, pentru un administrator de magazin.
REGULI STRICTE:
- Nu inventa cifre. Folosește exclusiv numerele din datele primite.
- Nu afirma că o regulă e redundantă dacă nu apare în constatări.
- Impactul este măsurat prin reluarea istoricului cu fiecare regulă scoasă pe rând: „venit” negativ înseamnă că regula acordă reduceri, nu că pierde bani degeaba.
- Spune ce ar trebui reparat primul și de ce.
- Maxim 220 de cuvinte.`,
    },
    {
      role: "user",
      content: `Eșantion analizat: ${analysis.sampleSize} evaluări.
Contexte reluate pentru impact: ${analysis.replaySampleSize}.

Constatări:
${findings || "(nicio constatare)"}

Utilizare pe regulă:
${usage || "(nicio regulă)"}

Impact măsurat pe regulă:
${impacts || "(nu s-a măsurat impactul — lipsesc contextele salvate)"}`,
    },
  ]);
}

// ---------------------------------------------------------------------------
// Narrating a simulation the application computed
// ---------------------------------------------------------------------------

/**
 * Explains a candidate-versus-live simulation in plain language.
 *
 * Every number handed over was produced by replaying recorded traffic. The model
 * is given the sample adequacy too, because a confident story about twelve
 * evaluations is worse than no story at all, and it is told to say so.
 */
export async function narrateSimulation(input: {
  label: string;
  simulation: SimulationResult;
}): Promise<AiResult<string>> {
  const deltas = input.simulation.deltas
    .filter((delta) => delta.delta !== 0)
    .map(
      (delta) =>
        `- ${delta.label}: ${delta.before} → ${delta.after} (${delta.delta > 0 ? "+" : ""}${delta.delta}${
          delta.percentChange === null ? "" : `, ${delta.percentChange}%`
        })`,
    )
    .join("\n");

  const hits = input.simulation.ruleHitChanges
    .slice(0, 12)
    .map((row) => `- ${row.key}: ${row.before} → ${row.after} potriviri`)
    .join("\n");

  return callModel([
    {
      role: "system",
      content: `Explici în română rezultatul unei simulări dintr-un rule engine, pentru un administrator de magazin.
Cifrele au fost calculate de aplicație prin reluarea evaluărilor reale pe regulile candidat.
REGULI STRICTE:
- Nu inventa cifre și nu recalcula nimic; folosește exclusiv valorile primite.
- Spune clar dacă eșantionul este prea mic pentru o concluzie.
- Descrie efectul pentru clienți și pentru magazin, apoi riscul principal.
- Nu recomanda publicarea; decizia este a omului.
- Maxim 180 de cuvinte.`,
    },
    {
      role: "user",
      content: `${input.label}
Eșantion: ${input.simulation.current.sampleSize} evaluări reluate (${input.simulation.sampleAdequacy}).

Metrici schimbate:
${deltas || "(nicio metrică nu se schimbă)"}

Potriviri pe regulă:
${hits || "(nicio schimbare de potriviri)"}`,
    },
  ]);
}

// ---------------------------------------------------------------------------
// Fraud incident triage
// ---------------------------------------------------------------------------

export const FRAUD_CLASSES = [
  "likely-fraud",
  "false-positive",
  "needs-review",
] as const;

export type FraudClass = (typeof FRAUD_CLASSES)[number];

export interface FraudClassification {
  orderId: string;
  classification: FraudClass;
  reason: string;
}

export interface FraudTriage {
  summary: string;
  recommendation: string;
  classifications: FraudClassification[];
  /**
   * Entries the model returned that could not be used: an order id that is not
   * in this store's incident list, or a label outside the fixed set. Kept and
   * shown rather than silently discarded, since a model referring to orders that
   * do not exist is something a reviewer should see.
   */
  dropped: string[];
}

/**
 * Classifies refused checkouts.
 *
 * The statistics are the application's and are passed in read-only. The model
 * contributes exactly two things: a label from a closed set for each incident,
 * and prose. It cannot invent an incident — ids not in the list are dropped — and
 * it cannot change a figure, because it is never asked for one.
 */
export async function classifyFraudIncidents(input: {
  stats: FraudStats;
}): Promise<AiResult<FraudTriage>> {
  const { stats } = input;

  if (stats.incidents.length === 0) {
    return {
      ok: false,
      error:
        "Nu există comenzi blocate în perioada analizată, deci nu este nimic de triat.",
      call: null,
    };
  }

  const incidentLines = stats.incidents
    .map(
      (incident) =>
        `- id=${incident.orderId} total=${money(incident.total)} ` +
        `client=${incident.customer ?? "necunoscut"} ` +
        `autenticat=${incident.authenticated ? "da" : "nu"} ` +
        `reguli=${incident.matchedRules.join("+") || "niciuna"} ` +
        `comenzi_plătite_anterior=${incident.priorPaidOrders} ` +
        `blocări_anterioare=${incident.priorBlockedOrders} ` +
        `motiv=${incident.reason ?? "nespecificat"}`,
    )
    .join("\n");

  const ruleLines = stats.byRule
    .map(
      (row) =>
        `- ${row.key}: ${row.blocked} blocări, ${money(row.blockedValue)} refuzați`,
    )
    .join("\n");

  const result = await callModel([
    {
      role: "system",
      content: `Triezi incidente antifraudă pentru RuleShop.

Primești statistici CALCULATE de aplicație și o listă de comenzi blocate real.
Răspunde DOAR cu JSON:
{
  "summary": "ce arată tiparul, pe scurt",
  "classifications": [
    {"orderId": "<exact unul din id-urile primite>", "classification": "likely-fraud" | "false-positive" | "needs-review", "reason": "de ce, pe baza datelor primite"}
  ],
  "recommendation": "ce ajustare de reguli merită analizată de un om"
}

REGULI STRICTE:
- Folosește exclusiv id-urile primite. Nu inventa comenzi.
- Nu inventa cifre; nu recalcula ratele.
- "false-positive" doar când datele o susțin (de exemplu client cu comenzi plătite anterior).
- Când semnalele sunt insuficiente, folosește "needs-review". Este un răspuns corect.
- Clasifică fiecare comandă primită, o singură dată.
- Nu propune publicarea vreunei modificări; decizia rămâne a omului.`,
    },
    {
      role: "user",
      content: `Perioadă: ultimele ${stats.windowDays} zile.
Comenzi înregistrate: ${stats.checkouts} (plătite ${stats.paid}, blocate ${stats.blocked}, rată blocare ${(stats.blockRate * 100).toFixed(2)}%).
Valoare refuzată: ${money(stats.blockedValue)}.
Blocate ca guest: ${stats.guestBlocked}; blocate autentificat: ${stats.authenticatedBlocked}.
Clienți blocați deși au comenzi plătite: ${stats.suspectedFalsePositives}.
Clienți blocați de mai multe ori: ${stats.repeatBlockedCustomers}.
Evaluări antifraudă înregistrate: ${stats.fraudEvaluations}.
Distribuția scorurilor de risc: ${stats.scoreBuckets.map((b) => `${b.label}: ${b.count}`).join(", ")}.

Blocări pe regulă:
${ruleLines || "(nicio regulă înregistrată pe comenzile blocate)"}

Comenzi blocate:
${incidentLines}`,
    },
  ]);

  if (!result.ok) return result;

  const parsed = extractJson<Record<string, unknown>>(result.data);
  if (!parsed) {
    return { ok: false, error: "Modelul nu a returnat JSON valid.", call: result.call };
  }

  const allowed = new Set(stats.incidents.map((incident) => incident.orderId));
  const seen = new Set<string>();
  const classifications: FraudClassification[] = [];
  const dropped: string[] = [];

  const rows = Array.isArray(parsed.classifications) ? parsed.classifications : [];
  for (const row of rows) {
    if (!row || typeof row !== "object") {
      dropped.push("intrare care nu este un obiect");
      continue;
    }

    const candidate = row as Record<string, unknown>;
    const orderId =
      typeof candidate.orderId === "string" ? candidate.orderId : null;

    if (!orderId || !allowed.has(orderId)) {
      dropped.push(`comandă inexistentă: ${orderId ?? "fără id"}`);
      continue;
    }
    if (seen.has(orderId)) {
      dropped.push(`clasificare duplicată pentru ${orderId}`);
      continue;
    }

    const label = candidate.classification;
    if (
      typeof label !== "string" ||
      !FRAUD_CLASSES.includes(label as FraudClass)
    ) {
      dropped.push(`etichetă necunoscută pentru ${orderId}: ${String(label)}`);
      continue;
    }

    seen.add(orderId);
    classifications.push({
      orderId,
      classification: label as FraudClass,
      reason:
        typeof candidate.reason === "string" && candidate.reason.trim()
          ? candidate.reason.trim()
          : "Fără motiv formulat.",
    });
  }

  if (classifications.length === 0) {
    return {
      ok: false,
      error:
        "Modelul nu a clasificat nicio comandă reală din listă. Statisticile calculate de aplicație rămân valabile.",
      call: result.call,
    };
  }

  return {
    ok: true,
    data: {
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      recommendation:
        typeof parsed.recommendation === "string" ? parsed.recommendation : "",
      classifications,
      dropped,
    },
    call: result.call,
  };
}

// ---------------------------------------------------------------------------
// Natural language to a structured rule
// ---------------------------------------------------------------------------

export interface RuleProposal {
  rule: RuleDefinition;
  /** The model's own stated confidence. A claim, not evidence. */
  confidence: number;
  reasoning: string;
}

export async function proposeRuleFromNaturalLanguage(input: {
  prompt: string;
  category: DecisionType;
  schema: ContextSchema;
  existingKeys: string[];
}): Promise<AiResult<RuleProposal>> {
  const result = await callModel([
    {
      role: "system",
      content: `Generezi O SINGURĂ regulă JSON pentru RuleShop.

Răspunde DOAR cu JSON:
{
  "key": "slug-ascii-cu-cratime",
  "name": "nume scurt",
  "description": "ce face regula",
  "category": "${input.category}",
  "priority": număr întreg (mai mare câștigă conflictele),
  "enabled": true,
  "conditions": <Condition>,
  "actions": [<Action>],
  "confidence": număr între 0 și 1,
  "reasoning": "de ce ai ales aceste condiții"
}

Condition:
  {"op":"and"|"or","children":[Condition,...]}
  {"op":"not","child":Condition}
  {"op":"eq"|"neq"|"gt"|"gte"|"lt"|"lte"|"in"|"contains"|"exists","path":"...","value":...}

Action (doar aceste tipuri):
  {"type":"discountPercent","value":0-100}
  {"type":"setFixedPrice","value":number}
  {"type":"setShipping","method":"...","cost":number}
  {"type":"addShippingOption","method":"...","cost":number,"label":"..."}
  {"type":"blockCheckout","reason":"..."}
  {"type":"flagFraud","score":0-100,"reason":"..."}
  {"type":"setAvailability","available":boolean,"reason":"..."}
  {"type":"grantLoyalty","points":number}
  {"type":"setTheme","themeId":"..."}
  {"type":"set","path":"...","value":...}

CÂMPURI DISPONIBILE — folosește exclusiv aceste căi, cu operatorii permiși:
${describeSchemaForPrompt(input.schema, input.category)}

Chei deja folosite (alege alta): ${input.existingKeys.join(", ") || "niciuna"}

Valorile respectă tipul câmpului: număr pentru number, true/false pentru boolean,
o valoare din listă pentru enum, AAAA-LL-ZZ pentru date.`,
    },
    { role: "user", content: input.prompt },
  ]);

  if (!result.ok) return result;
  return parseProposal(result.data, result.call, {
    schema: input.schema,
    existingKeys: input.existingKeys,
  });
}

function parseProposal(
  content: string,
  call: ModelCall,
  options: {
    schema: ContextSchema;
    existingKeys?: string[];
    requireKey?: string;
  },
): AiResult<RuleProposal> {
  const parsed = extractJson<Record<string, unknown>>(content);
  if (!parsed) {
    return { ok: false, error: "Modelul nu a returnat JSON valid.", call };
  }

  const confidence =
    typeof parsed.confidence === "number" &&
    parsed.confidence >= 0 &&
    parsed.confidence <= 1
      ? parsed.confidence
      : 0.5;
  const reasoning =
    typeof parsed.reasoning === "string" ? parsed.reasoning : "";

  // The model's metadata is not part of a rule and must not reach validation.
  const { confidence: _confidence, reasoning: _reasoning, ...candidate } = parsed;
  void _confidence;
  void _reasoning;

  const validation = validateRule(candidate, { schema: options.schema });
  if (!validation.ok || !validation.data) {
    return {
      ok: false,
      error: `Propunerea nu a trecut validarea: ${validation.errors.join("; ")}`,
      call,
    };
  }

  if (options.requireKey && validation.data.key !== options.requireKey) {
    // A renamed rule would silently create a second one instead of revising the
    // one under review.
    return {
      ok: false,
      error: `Propunerea a schimbat cheia regulii (${options.requireKey} → ${validation.data.key}).`,
      call,
    };
  }

  if (options.existingKeys?.includes(validation.data.key)) {
    return {
      ok: false,
      error: `Cheia "${validation.data.key}" există deja în această versiune.`,
      call,
    };
  }

  return {
    ok: true,
    data: { rule: validation.data, confidence, reasoning },
    call,
  };
}

// ---------------------------------------------------------------------------
// Explaining a version diff
// ---------------------------------------------------------------------------

/**
 * Explains in plain language what publishing a version would change.
 *
 * The diff is computed structurally; this only translates it. Useful exactly at
 * the moment of publishing, when the person approving may not be the person who
 * wrote the rules.
 */
export async function explainDiff(input: {
  fromVersion: number;
  toVersion: number;
  diffs: RuleDiff[];
  schema: ContextSchema;
}): Promise<AiResult<string>> {
  const lines: string[] = [];

  for (const diff of input.diffs) {
    if (diff.kind === "unchanged") continue;

    if (diff.kind === "added") {
      lines.push(
        `ADĂUGATĂ ${diff.key} (${diff.after.category}, prioritate ${diff.after.priority}): dacă ${describeConditionWith(diff.after.conditions, input.schema)}`,
      );
    } else if (diff.kind === "removed") {
      lines.push(
        `ELIMINATĂ ${diff.key} (${diff.before.category}): dacă ${describeConditionWith(diff.before.conditions, input.schema)}`,
      );
    } else {
      const changes = diff.changes
        .map(
          (change) =>
            `${change.label}: "${change.beforeText ?? JSON.stringify(change.before)}" → "${change.afterText ?? JSON.stringify(change.after)}"`,
        )
        .join("; ");
      lines.push(`MODIFICATĂ ${diff.key}: ${changes}`);
    }
  }

  if (lines.length === 0) {
    return {
      ok: false,
      error: "Cele două versiuni nu diferă; nu este nimic de explicat.",
      call: null,
    };
  }

  return callModel([
    {
      role: "system",
      content: `Explici în română, pentru un administrator de magazin, ce se schimbă între două versiuni de reguli.
Primești o listă de diferențe deja calculate.
REGULI:
- Descrie efectul asupra clienților, nu structura JSON.
- Semnalează explicit orice risc: reduceri mai mari, blocări suplimentare, reguli eliminate.
- Nu inventa modificări care nu apar în listă.
- Maxim 180 de cuvinte.`,
    },
    {
      role: "user",
      content: `Versiunea ${input.fromVersion} → ${input.toVersion}\n\n${lines.join("\n")}`,
    },
  ]);
}

// ---------------------------------------------------------------------------
// Proposing an improvement to an existing rule
// ---------------------------------------------------------------------------

/**
 * Proposes a revision of a rule the analysis flagged.
 *
 * The findings handed over are the application's, and whatever comes back is
 * validated and then simulated against real history before anyone sees a
 * recommendation. The model contributes a hypothesis; the platform decides
 * whether it holds up.
 */
export async function proposeImprovement(input: {
  rule: RuleDefinition;
  findings: RuleFinding[];
  usage: { matched: number; won: number };
  /** Leave-one-out measurement for this rule, when history allowed one. */
  impact: RuleImpact | null;
  schema: ContextSchema;
}): Promise<AiResult<RuleProposal>> {
  const result = await callModel([
    {
      role: "system",
      content: `Propui o versiune îmbunătățită a unei reguli existente din RuleShop.

Păstrează aceeași "key" și aceeași "category". Poți schimba condițiile, acțiunile și prioritatea.
Răspunde DOAR cu JSON: regula completă plus "confidence" (0-1) și "reasoning".

REGULI STRICTE:
- Folosește exclusiv câmpurile de mai jos, cu operatorii permiși pentru tipul lor.
- Statisticile primite sunt măsurate de aplicație; nu le contrazice și nu inventa altele.
- Dacă regula nu are niciun efect măsurat, spune în "reasoning" ce anume o făcea inutilă.

CÂMPURI DISPONIBILE:
${describeSchemaForPrompt(input.schema, input.rule.category)}`,
    },
    {
      role: "user",
      content: `Regula actuală:
${JSON.stringify(input.rule, null, 2)}

Statistici calculate de aplicație: ${input.usage.matched} potriviri, ${input.usage.won} câștigate.
${
  input.impact
    ? `Impact măsurat prin reluarea istoricului fără această regulă:
${impactLine(input.impact)}`
    : "Impact nemăsurat: nu existau contexte salvate pentru reluare."
}

Probleme constatate:
${input.findings.map(findingLine).join("\n") || "(niciuna)"}

Propune o variantă care rezolvă problemele constatate.`,
    },
  ]);

  if (!result.ok) return result;
  return parseProposal(result.data, result.call, {
    schema: input.schema,
    requireKey: input.rule.key,
  });
}
