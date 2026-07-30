# RuleShop storefront (Vite SPA)

Blank shop bound to **one** store via an API key. No app server — static files only.

Full HTTP reference: **http://localhost:3001/docs** (also [docs/storefront-api.md](../../docs/storefront-api.md)).

## Quick start (Docker)

Published image (GHCR):

```bash
docker pull ghcr.io/<owner>/ruleshop-storefront:latest

docker run --rm -p 3000:80 \
  -e RULESHOP_API_URL=https://your-control-plane.example \
  -e RULESHOP_API_KEY=rsk_your_store_key \
  ghcr.io/<owner>/ruleshop-storefront:latest
```

Open http://localhost:3000. Configure CORS on the control plane (`STOREFRONT_ORIGIN`) to allow this origin.

Build locally from the monorepo root:

```bash
docker build -f apps/storefront/Dockerfile -t ruleshop-storefront:latest .
docker run --rm -p 3000:80 \
  -e RULESHOP_API_URL=http://host.docker.internal:3001 \
  -e RULESHOP_API_KEY=rsk_demo_atelier_nord_dev_only_0001 \
  ruleshop-storefront:latest
```

Publish (maintainers):

```bash
# manual
docker tag ruleshop-storefront:latest ghcr.io/<owner>/ruleshop-storefront:latest
docker push ghcr.io/<owner>/ruleshop-storefront:latest

# or tag a release: git tag storefront-v0.1.0 && git push --tags
# → GitHub Action "Publish storefront image"
```

## Setup (degit / npm)

```bash
npx degit <owner>/ruleshop/apps/storefront my-store
cd my-store
cp .env.example .env
# set VITE_RULESHOP_API_KEY (from the control-plane dashboard)
# set VITE_RULESHOP_API_URL to your control plane origin
npm install
npm run dev
```

Open http://localhost:3000. On failure you will see **Magazin neconectat**.

## Env

| Variable | When | Meaning |
| --- | --- | --- |
| `RULESHOP_API_URL` | Docker runtime | Control plane base URL |
| `RULESHOP_API_KEY` | Docker runtime | Store key (`rsk_…`) |
| `VITE_RULESHOP_API_URL` | local Vite build | Same as above (baked at build) |
| `VITE_RULESHOP_API_KEY` | local Vite build | Same as above (baked at build) |

## Client modules

| Path | Role |
| --- | --- |
| `src/lib/api.ts` | HTTP client for `/api/v1/bootstrap` and `/api/v1/store/*` |
| `src/lib/runtime-config.ts` | Runtime `/config.js` + Vite env |
| `src/sdk/RuleShopProvider.tsx` | Bootstrap + theme CSS vars + `useRuleShop()` |
| `src/lib/session.ts` | Guest id + customer JWT |

## Build (static)

```bash
npm run build
npm run preview
```

`dist/` is the static deploy artifact.
