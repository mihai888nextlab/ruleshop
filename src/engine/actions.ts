import { setByPath } from "./path";
import type { Action } from "./types";
import { ACTION_PATHS } from "./types";

export function actionConflictKey(action: Action): string {
  if (action.type === "set") return `set:${action.path}`;
  if (action.type === "addShippingOption") {
    return `shippingOption:${action.method}`;
  }
  return ACTION_PATHS[action.type] ?? action.type;
}

export function applyAction(
  decision: Record<string, unknown>,
  action: Action,
): void {
  switch (action.type) {
    case "set":
      setByPath(decision, action.path, action.value);
      break;
    case "discountPercent":
      decision.discountPercent = action.value;
      break;
    case "setFixedPrice":
      decision.fixedPrice = action.value;
      break;
    case "setShipping":
      decision.shipping = { method: action.method, cost: action.cost };
      break;
    case "addShippingOption": {
      const opts = Array.isArray(decision.shippingOptions)
        ? ([...decision.shippingOptions] as Record<string, unknown>[])
        : [];
      const idx = opts.findIndex((o) => o.method === action.method);
      const entry = {
        method: action.method,
        cost: action.cost,
        label: action.label ?? action.method,
      };
      if (idx >= 0) opts[idx] = entry;
      else opts.push(entry);
      decision.shippingOptions = opts;
      break;
    }
    case "blockCheckout":
      decision.blocked = true;
      decision.blockReason = action.reason;
      break;
    case "flagFraud":
      decision.fraud = {
        score: action.score,
        reason: action.reason ?? null,
      };
      break;
    case "setAvailability":
      decision.availability = {
        available: action.available,
        reason: action.reason ?? null,
      };
      break;
    case "grantLoyalty":
      decision.loyaltyPoints = action.points;
      break;
    case "setTheme":
      decision.themeId = action.themeId;
      break;
    default:
      break;
  }
}
