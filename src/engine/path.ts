import type { ComparisonOp } from "./types";

export function getByPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function setByPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parts = path.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    if (cur[p] == null || typeof cur[p] !== "object") {
      cur[p] = {};
    }
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return null;
}

export function compare(
  op: ComparisonOp,
  left: unknown,
  right: unknown,
): boolean {
  switch (op) {
    case "exists":
      return left !== undefined && left !== null;
    case "eq":
      return left === right || String(left) === String(right);
    case "neq":
      return !(left === right || String(left) === String(right));
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const a = toNumber(left);
      const b = toNumber(right);
      if (a == null || b == null) return false;
      if (op === "gt") return a > b;
      if (op === "gte") return a >= b;
      if (op === "lt") return a < b;
      return a <= b;
    }
    case "in":
      return Array.isArray(right) && right.some((x) => x === left || String(x) === String(left));
    case "contains":
      if (typeof left === "string") return left.includes(String(right ?? ""));
      if (Array.isArray(left)) {
        return left.some((x) => x === right || String(x) === String(right));
      }
      return false;
    default:
      return false;
  }
}
