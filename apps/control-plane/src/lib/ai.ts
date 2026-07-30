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
  type RulesetAnalysis,
} from "@ruleshop/engine";

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
export const PROMPT_VERSION = "2026-07-30.1";

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
  return Boolean(process.env.MOONSHOT_API_KEY);
}

function client(): OpenAI {
  const apiKey = process.env.MOONSHOT_API_KEY;
  if (!apiKey) throw new Error("MOONSHOT_API_KEY lipsește din mediu");
  return new OpenAI({
    apiKey,
    baseURL: "https://api.moonshot.ai/v1",
    // A rule author is waiting on this; failing fast beats a hung page.
    timeout: 45_000,
    maxRetries: 1,
  });
}

function modelName(): string {
  return process.env.MOONSHOT_MODEL || "kimi-k2.5";
}

async function callModel(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  options: { temperature?: number } = {},
): Promise<AiResult<string>> {
  if (!isAiConfigured()) {
    return {
      ok: false,
      error:
        "Modulul AI nu este configurat (MOONSHOT_API_KEY lipsește). Analiza statistică rămâne disponibilă.",
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
      error:
        cause instanceof Error
          ? `Apelul către model a eșuat: ${cause.message}`
          : "Apelul către model a eșuat",
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

  return callModel([
    {
      role: "system",
      content: `Ești analist pentru RuleShop, o platformă de reguli pentru magazine online.
Primești constatări și statistici DEJA CALCULATE de aplicație. Sarcina ta este să le explici în română, pe scurt, pentru un administrator de magazin.
REGULI STRICTE:
- Nu inventa cifre. Folosește exclusiv numerele din datele primite.
- Nu afirma că o regulă e redundantă dacă nu apare în constatări.
- Spune ce ar trebui reparat primul și de ce.
- Maxim 200 de cuvinte.`,
    },
    {
      role: "user",
      content: `Eșantion analizat: ${analysis.sampleSize} evaluări.

Constatări:
${findings || "(nicio constatare)"}

Utilizare pe regulă:
${usage || "(nicio regulă)"}`,
    },
  ]);
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
  schema: ContextSchema;
}): Promise<AiResult<RuleProposal>> {
  const result = await callModel([
    {
      role: "system",
      content: `Propui o versiune îmbunătățită a unei reguli existente din RuleShop.

Păstrează aceeași "key" și aceeași "category". Poți schimba condițiile, acțiunile și prioritatea.
Răspunde DOAR cu JSON: regula completă plus "confidence" (0-1) și "reasoning".

CÂMPURI DISPONIBILE:
${describeSchemaForPrompt(input.schema, input.rule.category)}`,
    },
    {
      role: "user",
      content: `Regula actuală:
${JSON.stringify(input.rule, null, 2)}

Statistici calculate de aplicație: ${input.usage.matched} potriviri, ${input.usage.won} câștigate.

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
