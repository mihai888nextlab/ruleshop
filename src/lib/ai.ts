import OpenAI from "openai";
import { validateRule } from "@/engine";
import type { RuleDefinition } from "@/engine";

export function getKimiClient() {
  const apiKey = process.env.MOONSHOT_API_KEY;
  if (!apiKey) {
    throw new Error("MOONSHOT_API_KEY lipsește din mediu");
  }
  return new OpenAI({
    apiKey,
    baseURL: "https://api.moonshot.ai/v1",
  });
}

export function getKimiModel() {
  return process.env.MOONSHOT_MODEL || "kimi-k2.5";
}

export async function kimiChat(messages: OpenAI.Chat.ChatCompletionMessageParam[]) {
  const client = getKimiClient();
  const res = await client.chat.completions.create({
    model: getKimiModel(),
    messages,
    temperature: 0.2,
  });
  return res.choices[0]?.message?.content ?? "";
}

export function extractJson<T = unknown>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1]! : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < 0) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

export async function proposeRuleFromNaturalLanguage(
  prompt: string,
  categoryHint?: string,
): Promise<{
  ok: boolean;
  rule?: RuleDefinition;
  confidence: number;
  raw: string;
  errors: string[];
}> {
  const content = await kimiChat([
    {
      role: "system",
      content: `Ești un asistent pentru RuleShop. Generezi O SINGURĂ regulă JSON validă.
Schema:
{
  "key": "slug-ascii",
  "name": "string",
  "description": "string",
  "category": "pricing"|"shipping"|"fraud"|"availability"|"loyalty"|"theme",
  "priority": number,
  "enabled": true,
  "conditions": Condition,
  "actions": Action[],
  "confidence": 0-1
}
Condition: {op:"and"|"or", children:Condition[]} | {op:"not", child:Condition} | {op:"eq"|"neq"|"gt"|"gte"|"lt"|"lte"|"in"|"contains"|"exists", path:string, value?:any}
Action types: discountPercent, setFixedPrice, setShipping, addShippingOption, blockCheckout, flagFraud, setAvailability, grantLoyalty, setTheme, set
NU inventa tipuri de acțiuni. Răspunde DOAR cu JSON.`,
    },
    {
      role: "user",
      content: categoryHint
        ? `Categorie preferată: ${categoryHint}\nCerință: ${prompt}`
        : prompt,
    },
  ]);

  const parsed = extractJson<RuleDefinition & { confidence?: number }>(content);
  if (!parsed) {
    return { ok: false, confidence: 0, raw: content, errors: ["JSON invalid de la model"] };
  }
  const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.5;
  const { confidence: _, ...ruleCandidate } = parsed as RuleDefinition & {
    confidence?: number;
  };
  const v = validateRule(ruleCandidate);
  if (!v.ok || !v.data) {
    return { ok: false, confidence, raw: content, errors: v.errors };
  }
  return { ok: true, rule: v.data, confidence, raw: content, errors: [] };
}
