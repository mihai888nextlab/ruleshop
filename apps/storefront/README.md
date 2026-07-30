# RuleShop storefront (Vite SPA)

Blank shop bound to **one** store via an API key. No app server — static files only.

Full HTTP reference: **http://localhost:3001/docs** (also [docs/storefront-api.md](../../docs/storefront-api.md)).

## Quick start (Docker)

Published image (GHCR):

```bash
docker pull ghcr.io/mihai888nextlab/ruleshop-storefront:latest && docker run --rm -p 3008:80 \
  -e RULESHOP_API_URL=https://your-control-plane.example \
  -e RULESHOP_API_KEY=rsk_your_store_key \
  ghcr.io/mihai888nextlab/ruleshop-storefront:latest
```

`RULESHOP_API_URL` is used by the **browser** (not the container). Use a URL your machine can reach — `http://localhost:3001` for a local control plane, or your public HTTPS origin.

Open http://localhost:3008. Configure CORS on the control plane (`STOREFRONT_ORIGIN=http://localhost:3008`) to allow this origin.

## Several shops in parallel

Each container is one store: its own API key, its own port, its own origin. The
control plane must be told about **every** origin, or the browser blocks the
ones it does not know — `STOREFRONT_ORIGIN` is a comma-separated allowlist:

```bash
# apps/control-plane/.env — then restart the control plane
STOREFRONT_ORIGIN="http://localhost:3008,http://localhost:3009,http://localhost:3010"
```

Only the **host port** matters; every container still listens on `80` inside.

```bash
docker run -d --name shop-fashion     -p 3008:80 -e RULESHOP_API_KEY=rsk_fashion…     -e RULESHOP_API_URL=http://localhost:3001 ruleshop-storefront:latest
docker run -d --name shop-electronics -p 3009:80 -e RULESHOP_API_KEY=rsk_electronics… -e RULESHOP_API_URL=http://localhost:3001 ruleshop-storefront:latest
docker run -d --name shop-third       -p 3010:80 -e RULESHOP_API_KEY=rsk_third…       -e RULESHOP_API_URL=http://localhost:3001 ruleshop-storefront:latest
```

Or use the ready-made [`docker-compose.storefronts.yml`](./docker-compose.storefronts.yml):

```bash
docker compose -f apps/storefront/docker-compose.storefronts.yml up -d
```

Two things that bite here:

- **`RULESHOP_API_URL` is resolved by the browser, not the container.** Inside a
  compose network `http://control-plane:3001` is meaningless to the browser — keep
  it `http://localhost:3001`, the address the *user's* machine can reach.
- **Restart the control plane after editing `STOREFRONT_ORIGIN`.** It is read from
  the server environment, so a running process keeps the old list.

Build locally from the monorepo root:

```bash
docker build -f apps/storefront/Dockerfile -t ruleshop-storefront:latest .
docker run --rm -p 3008:80 \
  -e RULESHOP_API_URL=http://localhost:3001 \
  -e RULESHOP_API_KEY=rsk_demo_atelier_nord_dev_only_0001 \
  ruleshop-storefront:latest
```

Publish (maintainers) — multi-arch (`amd64` + `arm64`):

```bash
# PAT needs: write:packages
echo $GITHUB_TOKEN | docker login ghcr.io -u mihai888nextlab --password-stdin

docker buildx create --use --name ruleshop-multi 2>/dev/null || docker buildx use ruleshop-multi
docker buildx build --platform linux/amd64,linux/arm64 \
  -f apps/storefront/Dockerfile \
  -t ghcr.io/mihai888nextlab/ruleshop-storefront:latest \
  --push .

# or trigger CI: Actions → "Publish storefront image" → Run workflow
# or: git tag storefront-v0.1.0 && git push origin storefront-v0.1.0
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

Open http://localhost:3008. On failure you will see **Magazin neconectat**.

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
