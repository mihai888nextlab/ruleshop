# Storefront API — connecting a shop to RuleShop

> **Live docs:** open [http://localhost:3001/docs](http://localhost:3001/docs) on the control plane (same content as this file).

RuleShop’s **rule engine and data live only in the control plane**. A shop (any static or SPA front end) talks to it over HTTP. One deploy = one store: the store is resolved from an API key, never from a client-supplied `storeId`.

This document is for integrators who want to:

1. Clone the blank Vite storefront, or
2. Build their own client against the same HTTP API.

Shared response shapes live in [`packages/contracts`](../packages/contracts) (Zod schemas). The reference client is [`apps/storefront`](../apps/storefront).

---

## Architecture

```text
┌─────────────────────┐         HTTPS + X-RuleShop-Key
│  Your shop (SPA)    │ ──────────────────────────────────┐
│  static hosting     │                                   │
└─────────────────────┘                                   ▼
                                              ┌───────────────────────┐
                                              │  Control plane        │
                                              │  /api/v1/bootstrap    │
                                              │  /api/v1/store/*      │
                                              │  rule engine + DB     │
                                              └───────────────────────┘
```

| Piece | Role |
| --- | --- |
| **Control plane** | Authoring UI, Postgres, rule evaluation, public Store API |
| **Store API key** (`rsk_…`) | Identifies which store a request belongs to |
| **Customer JWT** | Optional shopper session (cart merge, orders, profile) |
| **Guest id** | Stable anonymous subject for canary / cart before login |

Prices, shipping options, availability, fraud, loyalty, and theme are **computed on the server**. The client never submits monetary totals.

---

## 1. Get a store + API key

In the control plane:

- **Self-serve:** open `/register` → “Deschide un magazin” (creates store template + `STORE_ADMIN` + key), or
- **Platform admin:** `/platform` → create store with admin account, or
- **Existing store:** `/s/{slug}/admin/connection` → view prefix / regenerate key

The plaintext key is shown **once**. Only a hash is stored. Regenerating revokes previous keys.

Configure the control plane origin your shop will call (CORS):

```env
# apps/control-plane/.env
STOREFRONT_ORIGIN="http://localhost:3000"
CONTROL_PLANE_PUBLIC_URL="http://localhost:3001"
```

---

## 2. Authentication headers

Every Store API request (except bare health checks) must identify the store.

| Header | Required | Meaning |
| --- | --- | --- |
| `X-RuleShop-Key` | **Yes** | Store API key (`rsk_…`) |
| `Authorization: Bearer <jwt>` | No | Customer token from login/register |
| `X-Guest-Id` | Recommended | Stable guest id, pattern `g_[A-Za-z0-9_-]{8,64}` |
| `Content-Type` | For JSON bodies | `application/json` |

**Bootstrap** also accepts `Authorization: Bearer rsk_…` if you prefer a single header for the cold start. Prefer `X-RuleShop-Key` for all `/api/v1/store/*` calls so it does not collide with the customer JWT.

Errors use a uniform body:

```json
{ "error": "human-readable message", "details": optional }
```

Common statuses: `400` validation, `401` missing/invalid key or auth, `404` not found, `409` conflict, `422` profile validation, `429` bootstrap rate limit, `500` unexpected.

---

## 3. Bootstrap (required cold start)

Prove the key and load store identity + theme tokens (theme decision runs through the engine).

```http
GET /api/v1/bootstrap
X-RuleShop-Key: rsk_…
```

**200 example**

```json
{
  "storeId": "clx…",
  "storeName": "Atelier Nord",
  "slug": "fashion",
  "theme": {
    "key": "nord",
    "name": "Atelier Nord",
    "tokens": {
      "colors": { "bg": "#ecefe9", "fg": "#101612", "…": "…" },
      "fontDisplay": "syne",
      "fontBody": "figtree",
      "radius": 0,
      "displayTracking": -0.04,
      "displayWeight": 600,
      "density": "regular",
      "productRatio": "3 / 4",
      "heroOverlay": 0.78,
      "heroImage": "/uploads/fashion/….jpg"
    },
    "fallback": false
  }
}
```

Apply `tokens` as CSS custom properties (see `themeToCssVars` in `@ruleshop/contracts` or the storefront’s `src/lib/theme.ts`). Treat `heroImage` paths under `/uploads/…` as absolute URLs on the control-plane origin.

On failure, show a single “store not connected” screen — do not invent catalog data.

---

## 4. Store API (`/api/v1/store/*`)

Base URL: `{CONTROL_PLANE_URL}/api/v1/store`  
Always send `X-RuleShop-Key` (+ guest / customer headers as above).

### Catalog

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/products?q=&category=` | Priced list + theme envelope; never cache |
| `GET` | `/products/{productSlug}` | Detail + full pricing/availability traces |

Each product includes `basePrice`, `finalPrice`, `discountPercent`, `available`, and `pricingDecision` / `availabilityDecision` metadata (matched rules, canary, warnings, optional explanation).

### Cart

| Method | Path | Body |
| --- | --- | --- |
| `GET` | `/cart` | — |
| `PUT` | `/cart` | `{ "productSlug": "…", "quantity": 0–99 }` (`0` removes) |
| `DELETE` | `/cart` | Clears cart |

Response includes re-priced lines, `shippingOptions`, fraud preview, `viewer.authenticated`, and the current theme. Totals are server-computed.

### Checkout

```http
POST /api/v1/store/checkout
Content-Type: application/json

{
  "shippingMethod": "standard",
  "guestEmail": "guest@example.com",
  "idempotencyKey": "uuid-or-stable-token"
}
```

- `guestEmail` required for guests; ignored when authenticated.
- `idempotencyKey` required; retries with the same key return the same order (`replayed: true`).

### Auth (customers)

| Method | Path | Body |
| --- | --- | --- |
| `POST` | `/auth/register` | `{ "email", "password", "name?" }` |
| `POST` | `/auth/login` | `{ "email", "password" }` |

Response:

```json
{
  "token": "jwt…",
  "expiresIn": 604800,
  "customer": { "id", "email", "name", "loyaltyPoints" }
}
```

Store the JWT (e.g. `localStorage`) and send it as `Authorization: Bearer` on later calls. Password minimum length on register: **8**.

### Orders

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/orders` | Authenticated only |
| `GET` | `/orders/{orderId}?email=` | Member: own orders; guest: id + checkout email |

Order payloads include status, money fields, line items, and the decision traces that produced the order.

### Profile

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/profile` | Authenticated; dynamic fields from the store schema |
| `PUT` | `/profile` | `{ "values": { "city": "Cluj", "newsletter": true } }` |

`422` responses include per-field `errors` plus the updated `fields` list for inline form display.

---

## 5. Minimal client flow

```text
1. GET /bootstrap                         → theme + store name
2. GET /store/products                    → catalog (decided prices)
3. PUT /store/cart                        → add lines
4. GET /store/cart                        → shipping options from rules
5. POST /store/checkout                   → place order (idempotent)
6. optional: POST /store/auth/login       → JWT for history / profile
```

Pseudo-code:

```ts
const headers = {
  "X-RuleShop-Key": process.env.VITE_RULESHOP_API_KEY!,
  "X-Guest-Id": guestId, // persist across reloads
  ...(customerJwt ? { Authorization: `Bearer ${customerJwt}` } : {}),
};

const boot = await fetch(`${API}/api/v1/bootstrap`, { headers }).then((r) =>
  r.json(),
);
// apply boot.theme.tokens → CSS variables

const catalog = await fetch(`${API}/api/v1/store/products`, { headers }).then(
  (r) => r.json(),
);
```

---

## 6. Blank Vite storefront (reference SDK)

The app under [`apps/storefront`](../apps/storefront) is a **static** SPA you can clone:

```bash
npx degit <owner>/ruleshop/apps/storefront my-store
cd my-store
cp .env.example .env
# VITE_RULESHOP_API_URL=https://your-control-plane.example
# VITE_RULESHOP_API_KEY=rsk_…
npm i && npm run dev
```

| Module | Purpose |
| --- | --- |
| `src/lib/api.ts` | Thin HTTP wrappers (bootstrap, catalog, cart, checkout, auth, …) |
| `src/sdk/RuleShopProvider.tsx` | Bootstrap once, apply theme, expose `useRuleShop()` |
| `src/lib/session.ts` | Guest id + customer JWT in `localStorage` |
| `src/lib/theme.ts` | Token → CSS variables |

There is **no** database driver and **no** local rule evaluation in the shop. Rebuild/redeploy only when you change UI; publishing rules in the control plane changes behaviour immediately.

Dashboard **Conexiune** shows a copy-paste clone block with your key and API URL.

---

## 7. Security checklist

- Never accept `storeId` / slug from the client for authorization — key resolves the store server-side.
- Never let the client submit prices or discounts; only choices (quantity, shipping method, profile fields).
- Store API keys are secrets; regenerate if leaked. Prefer env vars / secret stores over committing keys.
- Customer JWTs are separate from staff Auth.js sessions and cannot access the control-plane UI.
- Restrict CORS with `STOREFRONT_ORIGIN` to your shop’s origin in production.

---

## 8. Legacy slug routes (optional)

Older demos may still call `/api/v1/stores/{slug}/…`. New integrations should use **`/api/v1/store/…` + `X-RuleShop-Key`** only. Slug routes do not replace key auth for a cloneable one-store deploy.

---

## Related docs

- [ARCHITECTURE.md](../ARCHITECTURE.md) — rule model, conflicts, canary, multi-tenancy
- [apps/storefront/README.md](../apps/storefront/README.md) — clone / env / build
- Control plane **Conexiune** page — key rotation + clone command for a live store
