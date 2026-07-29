# Architecture — RuleShop

## Overview

One Next.js deployment hosts multiple stores (`Store.slug`). Every domain row is scoped by `storeId`. Storefront routes live under `/s/[slug]/*`. The same TypeScript rule engine evaluates all decision types.

```
Storefront / Control plane
        │
        ▼
  POST /api/decide  or  runDecision()
        │
        ▼
  Resolve stable vs canary ruleset (deterministic hash)
        │
        ▼
  Custom engine (AST conditions → actions)
        │
        ▼
  Persist Evaluation + return decision + explanation
```

## Rule model

Rules are structured JSON (no arbitrary code execution).

**Condition AST**

- `and` / `or` / `not`
- Comparisons: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `contains`, `exists`
- Paths like `customer.tier`, `cart.subtotal`

**Actions**

- `discountPercent`, `setFixedPrice`, `setShipping`, `addShippingOption`
- `blockCheckout`, `flagFraud`, `setAvailability`, `grantLoyalty`, `setTheme`, `set`

Validated with Zod before save/publish (`src/engine/validate.ts`).

## Conflict strategy

Rules for a `decisionType` are sorted by **priority descending**. For each action conflict key (e.g. `discountPercent`), the highest priority wins. Equal priority → later rule wins, with a warning in the evaluation trace.

## Lifecycle

- `Ruleset` versions: `draft` → `published` | `canary` → `archived`
- `Deployment`: `stableVersion`, `canaryVersion`, `canaryPercent`
- Canary bucket: `sha256(storeId:subjectKey) % 100 < percent` (same user/session stays sticky)
- Kill switch: global flag or per decision category on `Store`
- Rollback: re-publish a previous version as stable
- Audit: `AuditLog` for publish, kill switch, AI review, orders, product edits

## Decision types

| Type | Typical caller |
|------|----------------|
| pricing | catalog, product, checkout lines |
| shipping | checkout |
| fraud | checkout submit |
| availability | catalog / product |
| loyalty | cart / checkout |
| theme | store layout |

## Multi-tenancy & auth

Roles: `CUSTOMER`, `OPERATOR`, `STORE_ADMIN`, `PLATFORM_ADMIN`.

Store roles are on `Membership`. Platform admin bypasses store checks. APIs and server actions always filter by `storeId`.

## AI (Moonshot Kimi)

- OpenAI-compatible client → `https://api.moonshot.ai/v1`
- Analyze unused rules (hit counts computed in-app)
- NL → structured rule (validated)
- Simulate candidate on historical evaluations (metrics computed in-app)
- **Approve creates a draft only — never auto-publishes**

## Key packages

- Engine: `src/engine/*`
- Decision service: `src/lib/decide.ts`
- Auth: `src/lib/auth.ts` (Auth.js credentials)

## Limitations / trade-offs

- Structured form + JSON AST editor instead of full drag-and-drop builder (faster, safer for the contest window)
- Payment is simulated
- Guest order history is confirmation-page based; authenticated users get full history
- AI features degrade gracefully without `MOONSHOT_API_KEY` (local analysis still works for unused-rule stats)
