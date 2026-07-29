# RuleShop

Platformă web multi-tenant: magazine online + control plane pentru un **rule engine** implementat de la zero. Deciziile (preț, livrare, antifraudă, disponibilitate, loialitate, temă) se schimbă prin publicarea regulilor, fără republicarea codului.

## Cerințe

- Node.js 20+
- Docker (PostgreSQL)
- Opțional: `MOONSHOT_API_KEY` pentru modulul AI (Kimi)

## Pornire rapidă

```bash
cp .env.example .env
docker compose up -d
npm install
npx prisma db push
npm run db:seed
npm run dev
```

Deschide [http://localhost:3000](http://localhost:3000).

### Conturi demo

| Email | Parolă | Rol |
|-------|--------|-----|
| admin@ruleshop.local | admin123 | Platform admin |
| admin@fashion.local | admin123 | Admin Atelier Nord |
| admin@electronics.local | admin123 | Admin Circuit Hub |
| vip@demo.local | demo123 | Client VIP |
| client@demo.local | demo123 | Client |

### Magazine

- `/s/fashion` — Atelier Nord
- `/s/electronics` — Circuit Hub

## Scripturi

- `npm run dev` — server dezvoltare
- `npm run build` / `npm start` — producție
- `npm test` — teste motor de reguli
- `npm run db:seed` — date demonstrative
- `npm run db:reset` — reset schemă + seed

## Demo recomandat

1. Cumpără ca guest sau VIP pe `/s/fashion` — observă reducerea VIP și panoul de decizie.
2. Intră ca `admin@fashion.local` → **Reguli** → creează draft, modifică `vip-discount`, publică stable.
3. Reîncarcă storefront-ul — comportament nou fără rebuild.
4. Deschide o evaluare / pagina comenzii pentru explicație.
5. **AI**: analizează reguli sau propune din NL → **Aprobă → draft** (nu publică automat).
6. Rollback sau kill switch pe o categorie.

## Documentație

Vezi [ARCHITECTURE.md](./ARCHITECTURE.md) pentru modelul regulilor, conflicte, canary și multi-tenancy.

## Variabile de mediu

Vezi `.env.example`:

- `DATABASE_URL`
- `AUTH_SECRET`
- `MOONSHOT_API_KEY` / `MOONSHOT_MODEL`
- `NEXTAUTH_URL`
