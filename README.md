# RuleShop

Platformă web multi-tenant: magazine online + **control plane** pentru un rule engine implementat de la zero. Prețurile, livrarea, antifrauda, disponibilitatea, loialitatea și tema se decid din **reguli publicate**, nu din cod — o schimbare de comportament înseamnă o versiune nouă de ruleset, nu un redeploy.

- **Fără cod arbitrar.** O regulă este JSON structurat (AST de condiții + acțiuni), validat cu Zod înainte de salvare și publicare.
- **Fără decizii pe client.** Storefront-ul trimite doar alegeri (cantitate, metodă de livrare); toate sumele se calculează pe server.
- **Fiecare decizie este explicabilă.** Fiecare evaluare păstrează contextul, regulile care au contribuit, motivul fiecărei potriviri și versiunea de ruleset.

---

## Cuprins

1. [Arhitectură](#1-arhitectură)
2. [Instalare](#2-instalare)
3. [Modelul regulilor](#3-modelul-regulilor)
4. [Motorul de evaluare](#4-motorul-de-evaluare)
5. [Puncte de decizie](#5-puncte-de-decizie)
6. [Lifecycle: versiuni, canary, rollback, kill switch](#6-lifecycle-versiuni-canary-rollback-kill-switch)
7. [Observabilitate](#7-observabilitate)
8. [Modulul AI](#8-modulul-ai)
9. [Securitate și multi-tenancy](#9-securitate-și-multi-tenancy)
10. [Storefront API](#10-storefront-api)
11. [Model de date](#11-model-de-date)
12. [Structura codului](#12-structura-codului)
13. [Testare](#13-testare)
14. [Variabile de mediu](#14-variabile-de-mediu)
15. [Scenarii de demo](#15-scenarii-de-demo)
16. [Limitări și compromisuri](#16-limitări-și-compromisuri)

---

## 1. Arhitectură

Trei workspace-uri npm într-un monorepo. **Doar control plane-ul atinge baza de date.**

```
┌────────────────────────┐   HTTP + X-RuleShop-Key   ┌──────────────────────────┐
│  Storefront (Vite SPA) │ ────────────────────────► │  Control plane (Next.js) │
│  static, :3008         │ ◄──────────────────────── │  :3001                   │
└────────────────────────┘      decizii + explicații └────────────┬─────────────┘
                                                                  │
                                                     ┌────────────▼─────────────┐
                                                     │  @ruleshop/engine        │
                                                     │  AST → decizie + trace   │
                                                     └────────────┬─────────────┘
                                                                  │
                                                          ┌───────▼────────┐
                                                          │  PostgreSQL    │
                                                          └────────────────┘
```

| Workspace | Rol |
|---|---|
| `apps/control-plane` | Next.js 16. Editor de reguli, lifecycle, API de decisioning, storefront server-rendered pe `/s/[slug]`, singurul cu acces la DB. |
| `apps/storefront` | Vite SPA. Magazin „blank”, legat de **un** magazin printr-o cheie API. Găzduire statică; nu are server propriu. |
| `packages/engine` | Motorul de reguli. TypeScript pur, fără I/O, fără dependențe de framework. |
| `packages/contracts` | Scheme Zod partajate între client și server (răspunsuri API, teme, profil). |

Fluxul unei decizii:

```
runDecision() / POST /api/decide
      │
      ├─► rezolvă ruleset-ul (stable vs canary, hash determinist pe subject)
      ├─► aplică kill switch-urile (global / categorie / regulă / versiune)
      ├─► evaluează regulile ordonate după prioritate
      ├─► rezolvă conflictele pe cheie de acțiune
      └─► persistă Evaluation (context + decizie + explicație) și întoarce decizia
```

Rezolvarea ruleset-ului este separată de evaluare intenționat: o pagină de catalog care evaluează 40 de produse citește deployment-ul **o dată** și evaluează de 40 de ori (`runDecisionBatch`), nu invers.

---

## 2. Instalare

### Cerințe

- Node.js 20+
- Docker (pentru PostgreSQL)
- Opțional: `GEMINI_API_KEY` pentru modulul AI

### Pornire

```bash
git clone <repo> && cd ruleshop
cp .env.example .env
cp apps/control-plane/.env.example apps/control-plane/.env

docker compose up -d          # PostgreSQL pe :5432
npm install                   # rulează automat prisma generate
npx prisma db push            # creează schema
npm run db:seed               # date demonstrative
npm run dev                   # control plane :3001 + storefront :3008
```

| URL | Ce este |
|---|---|
| http://localhost:3001 | Control plane (autentificare staff) |
| http://localhost:3001/docs | Documentația live a Storefront API |
| http://localhost:3001/s/fashion | Storefront server-rendered (Atelier Nord) |
| http://localhost:3008 | Storefront SPA (Vite), legat prin cheie API |

### Conturi demo

| Email | Parolă | Rol |
|---|---|---|
| `admin@ruleshop.local` | `admin123` | Platform admin |
| `admin@fashion.local` | `admin123` | Store admin — Atelier Nord |
| `admin@electronics.local` | `admin123` | Store admin — Circuit Hub |
| `vip@demo.local` | `demo123` | Client VIP (500 puncte în `fashion`) |
| `client@demo.local` | `demo123` | Client standard |

### Scripturi

| Comandă | Efect |
|---|---|
| `npm run dev` | Ambele aplicații în paralel |
| `npm run build` / `npm start` | Build și rulare de producție |
| `npm test` | Suita de teste (Vitest) |
| `npm run typecheck` | `tsc --noEmit` pe toate workspace-urile |
| `npm run db:seed` | Date demonstrative |
| `npm run db:reset` | Reset schemă + seed |

---

## 3. Modelul regulilor

O regulă este **date**, nu cod. Nu se evaluează niciodată string-uri ca expresii.

```jsonc
{
  "key": "vip-discount",          // unic per ruleset; stabil între versiuni
  "name": "Reducere VIP",
  "category": "pricing",          // punctul de decizie
  "priority": 100,                // mai mare = câștigă conflictele
  "enabled": true,
  "conditions": {
    "op": "and",
    "children": [
      { "op": "eq",  "path": "customer.tier",     "value": "vip" },
      { "op": "gte", "path": "product.basePrice", "value": 100 }
    ]
  },
  "actions": [{ "type": "discountPercent", "value": 15 }]
}
```

### Condiții (AST)

| Grupare | Comparatori |
|---|---|
| `and`, `or` (n copii), `not` (un copil) | `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `contains`, `exists` |

`path` este o cale în contextul deciziei: `customer.tier`, `cart.subtotal`, `product.category`, `customer.attributes.<cheie>`.

### Acțiuni

| Acțiune | Efect asupra deciziei |
|---|---|
| `discountPercent` | `decision.discountPercent` |
| `setFixedPrice` | `decision.fixedPrice` (are prioritate față de procent) |
| `setShipping` | `decision.shipping` — **impune** metoda, înlocuiește meniul |
| `addShippingOption` | adaugă/înlocuiește o opțiune în `decision.shippingOptions` |
| `blockCheckout` | `decision.blocked` + `blockReason` |
| `flagFraud` | `decision.fraud = { score, reason }` |
| `setAvailability` | `decision.availability = { available, reason }` |
| `grantLoyalty` | `decision.loyaltyPoints` |
| `setTheme` | `decision.themeId` — cheia unei teme definite de administrator |
| `set` | scriere generică pe o cale din decizie |

### Vocabular extensibil

Un administrator poate defini **atribute de client** (`CustomerAttributeDef`) tipate: `string`, `number`, `boolean`, `enum`, `date`. Fiecare devine automat:

- o variabilă în editorul de reguli la `customer.attributes.<cheie>`, cu **doar operatorii permiși de tipul ei**;
- un câmp în formularul de profil din storefront.

Adăugarea unei dimensiuni de segmentare nu cere cod și nu cere deploy. Atributele arhivate rămân citibile de regulile existente, dar nu mai sunt oferite pentru altele noi; ștergerea unui atribut referit de o regulă este refuzată.

### Validare

`packages/engine/src/validate.ts` verifică înainte de fiecare salvare și publicare:

- forma AST-ului și tipurile valorilor;
- că `path` există în schema de context a categoriei;
- că operatorul este permis pentru tipul câmpului (`contains` pe număr → eroare);
- că acțiunea este validă pentru categorie (`setShipping` într-o regulă `pricing` → eroare);
- că `setTheme` referă o temă care există în magazin.

---

## 4. Motorul de evaluare

`evaluate()` este o funcție pură: aceleași intrări dau același rezultat, fără I/O.

```
1. kill switch global?               → decizie goală, trace explicativ
2. categoria e oprită?               → idem
3. filtrează regulile: categoria cerută, enabled, cheie neomorâtă
4. sortează după priority DESC
5. pentru fiecare regulă: evaluează condițiile, notează motivul (potrivit sau nu)
6. pentru fiecare acțiune a regulilor potrivite: rezolvă conflictul
7. întoarce { decision, matchedRules, explanation, warnings, traceId }
```

### Rezolvarea conflictelor

Fiecare acțiune are o **cheie de conflict** (`actionConflictKey`): `discountPercent`, `shipping`, `blocked`, `set:<cale>`, `shippingOption:<metodă>` etc.

- Prioritate mai mare câștigă cheia.
- La **prioritate egală**, câștigă regula evaluată mai târziu și se emite un **warning** în trace — un conflict nedeterminist este raportat, nu ascuns.
- `addShippingOption` se acumulează per metodă; `setShipping` înlocuiește complet meniul, pentru că exprimă „livrarea este asta”, nu „mai adaugă o opțiune”.

### Explicația

Fiecare evaluare produce un pas per regulă considerată:

```jsonc
{ "ruleKey": "vip-discount", "ruleName": "Reducere VIP",
  "matched": true, "reason": "customer.tier = \"vip\" ȘI product.basePrice ≥ 100" }
```

Regulile care **nu** s-au potrivit apar și ele, cu motivul respingerii — „de ce nu am primit reducerea” este la fel de important ca „de ce am primit-o”.

---

## 5. Puncte de decizie

| Categorie | Context primit | Apelant tipic |
|---|---|---|
| `pricing` | `customer`, `product`, `store` | catalog, pagină produs, fiecare linie de coș |
| `shipping` | `customer`, `cart`, `store` | coș, checkout |
| `fraud` | `customer`, `cart`, `order` | checkout (înainte de plasare) |
| `availability` | `customer`, `product` | catalog, pagină produs |
| `loyalty` | `customer`, `cart`, `order` | coș, checkout |
| `theme` | `customer`, `store` | layout-ul magazinului |

Contextul `customer` conține **fapte, nu concluzii**: `isGuest`, `verified`, `loyaltyPoints`, `tier`, `orderCount`, `totalSpent`, `avgOrderValue`, `isFirstOrder`, `attributes`. Regulile decid ce înseamnă. `tier` este singura valoare derivată (VIP la ≥ 400 puncte) și este calculată dintr-un singur loc, ca profilul afișat să nu poată contrazice regulile evaluate.

Toate faptele sunt **per magazin**: istoricul de comenzi și punctele dintr-un magazin nu influențează deciziile din altul.

### Teme ca date

O temă este un set de design tokens (culori hex, fonturi dintr-o listă închisă, radius, densitate). O regulă `setTheme` o alege după cheie, iar storefront-ul le aplică drept CSS custom properties. O temă nu poate injecta CSS, iar adăugarea unui look nou nu cere deploy.

---

## 6. Lifecycle: versiuni, canary, rollback, kill switch

```
draft ──publish──► published ──► archived
  │                    ▲
  └──publish canary────┘
```

`Ruleset` este versionat per magazin (`@@unique([storeId, version])`). O versiune publicată este **imutabilă** — de aceea rămâne auditabilă și restaurabilă.

`Deployment` (unul per magazin) ține `stableVersion`, `canaryVersion` și `canaryPercent`.

### Canary determinist

```ts
sha256(`${storeId}:${subjectKey}`) % 100 < canaryPercent
```

Fără stare, fără random: același client rămâne în aceeași cohortă între page loads, iar cohortele nu se amestecă între magazine. `subjectKey` este `user:<id>` sau `guest:<id>`.

### Rollback

Republicarea unei versiuni anterioare ca `stable`. Nu se șterge nimic — versiunea „greșită” rămâne în istoric, cu evaluările ei.

### Kill switch

Patru niveluri, toate pe `Store`, nu în ruleset — un „oprește asta acum” nu trebuie să ceară editarea unei versiuni imutabile:

| Nivel | Câmp | Efect |
|---|---|---|
| Global | `killSwitchEnabled` | oprește orice evaluare |
| Categorie | `killSwitchCategories` | oprește un punct de decizie |
| Regulă | `killedRuleKeys` | scoate o regulă din serviciu |
| Versiune | `killedVersions` | refuză o versiune la rezolvare |

O versiune stable omorâtă rezolvă la **niciun ruleset** — fiecare decizie cade pe default. Asta este raza de acțiune intenționată: oprește imediat, în loc să servească tăcut o versiune veche pe care n-a ales-o nimeni. Un canary omorât cade pe stable, ceea ce este chiar rostul unui canary.

---

## 7. Observabilitate

| Pagină | Conținut |
|---|---|
| `/s/[slug]/rules/evaluations` | Istoricul evaluărilor: context, decizie, reguli potrivite, canary, warnings |
| `/s/[slug]/rules/diff` | Diff între două versiuni, per regulă (adăugată / ștearsă / modificată / neschimbată) |
| `/s/[slug]/rules/audit` | Jurnal de audit |
| `/s/[slug]/rules/test` | Harness: rulează un context arbitrar pe orice versiune, fără a o publica |
| `/s/[slug]/admin/analytics` | Statistici de utilizare a regulilor |

Fiecare `Evaluation` păstrează contextul complet, decizia, explicația, warnings, versiunea și dacă a fost canary. Comenzile păstrează `decisionTrace` la momentul plasării: regulile se schimbă, dar o comandă trebuie să rămână explicabilă prin regulile care au produs-o efectiv.

`AuditLog` înregistrează publicări, rollback, kill switch, rotații de chei, modificări de produse, comenzi plasate/blocate și fiecare decizie AI.

În storefront, deciziile sunt vizibile pentru client: reducerea aplicată, regulile care au contribuit, punctele de loialitate câștigate și marcajul `canary`.

---

## 8. Modulul AI

Google Gemini prin endpoint-ul compatibil OpenAI. **Fără cheie, funcțiile statistice locale rămân disponibile** — analiza regulilor nefolosite și simularea nu depind de model.

| Funcție | Ce face |
|---|---|
| Analiza ruleset-ului | Reguli nefolosite, redundante, umbrite sau cu impact zero — **calculate în aplicație**, nu de model |
| NL → regulă | Text liber → regulă structurată, validată prin exact aceleași reguli ca una scrisă de mână |
| Simulare | Rulează un candidat pe evaluările istorice: rată de potrivire, discount mediu, rată de blocare |
| Propuneri de îmbunătățire | Sugestii cu metrici de business și impact estimat |
| Triaj antifraudă | Clasifică incidentele de fraudă |
| Explicarea unui diff | Rezumat în limbaj natural al diferenței dintre două versiuni |

### Garanții

- **Aprobarea umană este obligatorie.** O sugestie aprobată creează un **draft** — nu publică niciodată. Audit-ul înregistrează explicit `published: false`.
- **Statisticile aplicației sunt ținute separat** de ce a spus modelul (`analysis` vs `proposal`), ca cele două să nu poată fi confundate.
- **Trasabilitate completă**: model, versiune de prompt, latență, tokeni și **răspunsul brut** — o sugestie este auditabilă doar dacă textul original poate fi recitit, nu doar rezultatul parsat.
- **Validare și încredere**: răspunsurile sunt parsate defensiv, validate cu Zod și însoțite de un scor de încredere (`ai-trust.ts`).

---

## 9. Securitate și multi-tenancy

### Izolare

Fiecare rând de domeniu are `storeId`. Toate query-urile — API și server actions — filtrează după el. Punctele sensibile:

- Punctele de loialitate stau pe `Membership`, nu pe `User`: aceeași persoană poate fi VIP într-un magazin și nouă în altul.
- Profilul de client (`CustomerProfile`) este per magazin.
- Token-urile de client sunt legate de `storeId` și cer un membership activ pentru **acel** magazin.

### Roluri

`CUSTOMER` · `OPERATOR` · `STORE_ADMIN` · `PLATFORM_ADMIN`

Rolurile de magazin sunt pe `Membership`; `platformRole` este global. `requireStoreRole()` se execută **pe server**, în fiecare server action și pagină protejată. Platform admin trece peste verificările de magazin.

### Rezolvarea tenantului

Traficul de storefront rezolvă magazinul din header-ul `X-RuleShop-Key`, **niciodată dintr-un `storeId` trimis de client**. Cheia este afișată o singură dată la creare; se stochează doar SHA-256.

### Alte măsuri

- Parole cu bcrypt; `AUTH_SECRET` și `STOREFRONT_JWT_SECRET` sunt distincte, ca un token de client scurs să nu poată fi rejucat pe rute de staff.
- Toate intrările validate cu Zod la graniță.
- Rate limiting pe endpoint-urile publice.
- CORS pe allowlist (vezi mai jos).
- Checkout idempotent: `idempotencyKey` unic per magazin; o retrimitere întoarce comanda originală.
- Stocul se decrementează condiționat (`stock >= quantity`); o cursă pierdută dă rollback, nu vânzare peste stoc.
- Clientul nu trimite niciodată prețuri sau totaluri.

---

## 10. Storefront API

Referință completă: **http://localhost:3001/docs** sau [`docs/storefront-api.md`](./docs/storefront-api.md).

Bază: `/api/v1/store/*`. Fiecare cerere trimite `X-RuleShop-Key`.

| Metodă | Rută | Note |
|---|---|---|
| `GET` | `/api/v1/bootstrap` | Cold start: identitate magazin + temă |
| `GET` | `/store/products?q=&category=` | Catalog cu prețuri decise |
| `GET` | `/store/products/{slug}` | Detaliu + trace complet |
| `GET·PUT·DELETE` | `/store/cart` | Coș re-evaluat la fiecare citire |
| `POST` | `/store/checkout` | Cere `idempotencyKey` |
| `POST` | `/store/auth/register` · `/login` | JWT de client |
| `GET` | `/store/orders` · `/orders/{id}` | Istoric; guest prin id + email |
| `GET·PUT` | `/store/profile` | Câmpuri definite de magazin + sold de loialitate |

`POST /api/decide` expune motorul direct, pentru integrări proprii.

### Mai multe magazine în paralel

`STOREFRONT_ORIGIN` este o **listă separată prin virgulă**. Un control plane servește mai multe magazine, fiecare pe originea lui:

```env
STOREFRONT_ORIGIN="http://localhost:3008,http://localhost:3009,http://localhost:3010"
```

Originea care se potrivește este trimisă înapoi per cerere, cu `Vary: Origin`. O origine absentă din listă este refuzată de browser. Modificările cer **restart** la control plane.

```bash
docker compose -f apps/storefront/docker-compose.storefronts.yml up -d
```

`RULESHOP_API_URL` este rezolvat de **browser**, nu de container — un nume de serviciu din rețeaua compose nu înseamnă nimic acolo.

---

## 11. Model de date

PostgreSQL prin Prisma. Entitățile principale:

| Model | Rol |
|---|---|
| `Store` | Tenantul. Ține kill switch-urile. |
| `StoreApiKey` | Credențial de storefront; doar hash stocat. |
| `Membership` | Rolul și **punctele de loialitate** ale unui user într-un magazin. |
| `Product` · `Cart` · `CartItem` | Catalog și coș (guest sau user). |
| `Order` · `OrderItem` | Comenzi cu `decisionTrace` și `idempotencyKey`. |
| `Ruleset` · `Rule` | Versiuni de reguli; `Rule` ține AST-ul și acțiunile. |
| `Deployment` | `stableVersion`, `canaryVersion`, `canaryPercent`. |
| `Evaluation` | Fiecare decizie, cu context, explicație și warnings. |
| `AuditLog` | Operațiile importante. |
| `AiSuggestion` | Propunere AI + metrici + trasabilitate + stare de aprobare. |
| `CustomerAttributeDef` · `CustomerProfile` | Vocabular de segmentare definit de admin. |
| `Theme` | Design tokens selectabili prin reguli. |

Sumele monetare sunt `Decimal(12,2)` — niciodată float.

---

## 12. Structura codului

```
apps/control-plane/src/
  app/actions/       server actions (rules, ai, checkout, cart, themes, attributes…)
  app/api/v1/        Storefront API (key-scoped) + rute legacy pe slug
  app/api/decide/    API de decisioning
  app/s/[slug]/      storefront SSR + dashboard (rules, admin, themes, attributes)
  components/
    rule-builder/    editor: paletă drag-and-drop, arbore de condiții, listă de acțiuni
    ai/              consolă AI, carduri de sugestii, panouri de insight
  i18n/              mesaje ro/en pentru control plane
  lib/
    decide.ts           rezolvare ruleset + evaluare + persistare
    canary.ts           bucketing determinist
    customer-facts.ts   contextul `customer.*`
    cart-service.ts     prețuire coș end-to-end
    checkout-service.ts plasare comandă (tranzacție, stoc, puncte, audit)
    auth.ts             Auth.js + requireStoreRole
    cors.ts             allowlist de origini

packages/engine/src/
  types.ts conditions.ts actions.ts evaluate.ts   nucleul
  validate.ts schema.ts                           validare + schema de context
  analysis.ts impact.ts simulate.ts diff.ts       analiză, simulare, diff
  describe.ts path.ts                             explicații, acces pe cale

packages/contracts/src/   scheme Zod partajate
apps/storefront/src/      SPA: pages/ components/ sdk/ lib/
```

Regula de separare: motorul nu știe de HTTP sau de bază de date; serviciile nu știu de React; UI-ul nu decide niciodată prețuri.

---

## 13. Testare

```bash
npm test          # 170 de teste
npm run typecheck # strict, pe toate workspace-urile
```

| Fișier | Acoperă |
|---|---|
| `engine/evaluate.test.ts` | Evaluarea condițiilor și aplicarea acțiunilor |
| `engine/rules-behavior.test.ts` | Comportament end-to-end pe categorii, priorități, conflicte |
| `engine/kill-switch.test.ts` | Cele patru niveluri de oprire |
| `engine/schema.test.ts` · `analysis.test.ts` · `impact.test.ts` · `diff.test.ts` | Validare, analiză, impact, diff |
| `control-plane/multi-tenancy.test.ts` | Hash de chei, rate limiting, izolare între magazine |
| `control-plane/cors.test.ts` | Allowlist de origini |
| `control-plane/loyalty.test.ts` | Derivarea tier-ului și soldul expus |
| `control-plane/ai-trust.test.ts` | Parsare defensivă și scor de încredere |

---

## 14. Variabile de mediu

`apps/control-plane/.env`:

| Variabilă | Rol |
|---|---|
| `DATABASE_URL` | PostgreSQL |
| `AUTH_SECRET` | Semnează sesiunile de staff |
| `STOREFRONT_JWT_SECRET` | Semnează token-urile de client — **diferit** de `AUTH_SECRET` |
| `STOREFRONT_ORIGIN` | Allowlist CORS, separat prin virgulă |
| `CONTROL_PLANE_PUBLIC_URL` | URL public, folosit în instrucțiunile de conectare |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | Modulul AI (opțional) |

`apps/storefront/.env` (sau env de container: `RULESHOP_API_URL` / `RULESHOP_API_KEY`):

| Variabilă | Rol |
|---|---|
| `VITE_RULESHOP_API_URL` | Originea control plane-ului |
| `VITE_RULESHOP_API_KEY` | Cheia magazinului (`rsk_…`) |

---

## 15. Scenarii de demo

1. **Decizie vizibilă.** Cumpără ca guest, apoi ca `vip@demo.local` pe `/s/fashion`. Aceleași produse, prețuri diferite — panoul de decizie arată regula care a produs diferența.
2. **Schimbare fără deploy.** `admin@fashion.local` → **Reguli** → draft din versiunea live → modifică `vip-discount` la 25% → publică. Reîncarcă storefront-ul: comportament nou, fără rebuild.
3. **Canary.** Publică versiunea nouă pe 20%. Reîncarcă de mai multe ori ca același utilizator: cohorta nu se schimbă. Compară în lista de evaluări rândurile marcate `canary`.
4. **Diff și rollback.** `/rules/diff` între versiuni; apoi rollback la cea anterioară.
5. **Kill switch.** Oprește categoria `pricing`. Prețurile revin instant la bază, iar trace-ul explică de ce.
6. **Explicație.** Deschide o evaluare sau o comandă: regulile care au contribuit, cele care nu s-au potrivit și de ce.
7. **Antifraudă.** Comandă peste pragul de risc → blocată, cu motiv; comanda blocată rămâne înregistrată, fără mișcare de stoc și fără puncte.
8. **Loialitate.** Coșul arată punctele care vor fi acordate și regula care le acordă; după checkout, soldul din header se actualizează.
9. **Atribut nou.** Creează un atribut de client, folosește-l într-o regulă, completează-l din profilul din storefront — fără nicio linie de cod.
10. **AI.** Analizează ruleset-ul (reguli nefolosite), propune o regulă din text liber, simulează pe istoric, apoi **Aprobă → draft**. Verifică în audit că nu s-a publicat nimic.

---

## 16. Limitări și compromisuri

- **Editor**: paletă drag-and-drop (`@dnd-kit`) pentru condiții și acțiuni, plus formular structurat și editor JSON — în locul unui builder complet vizual pentru fiecare element. Alegere de timp, în favoarea validării stricte.
- **Plata este simulată.** Nu există integrare cu un procesator real; `status` trece direct în `PAID`.
- **Istoricul guest** este bazat pe pagina de confirmare (id + email); doar utilizatorii autentificați au istoric complet.
- **Rate limiting în memorie**, per proces — suficient pentru un deploy single-node, nu pentru mai multe instanțe.
- **AI degradează elegant**: fără `GEMINI_API_KEY`, analiza statistică locală rămâne funcțională, dar propunerile în limbaj natural nu.
- **`customerContext` vs `buildCustomerFacts`**: storefront-ul SSR de pe `/s/[slug]` construiește un context mai subțire decât API-ul (fără `orderCount`, `totalSpent`, `attributes`). Regulile care folosesc acele câmpuri se comportă diferit în cele două storefront-uri. De unificat.
- **Simularea** rulează pe evaluările istorice stocate; un magazin fără trafic nu are pe ce simula.

---

## Documentație suplimentară

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — modelul regulilor, conflicte, canary, multi-tenancy
- [`docs/storefront-api.md`](./docs/storefront-api.md) — referință HTTP completă (live pe `/docs`)
- [`apps/storefront/README.md`](./apps/storefront/README.md) — clonare, env, build, mai multe magazine în paralel
