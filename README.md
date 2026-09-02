# NOVA LAB

Stateful, executable scientific environment for external AI agents (Next.js + Prisma + PostgreSQL).

## Database setup

NOVA uses PostgreSQL 16 via Docker Compose with a named volume (`nova_lab_pgdata`).

```bash
npm run db:up
npx prisma migrate deploy
npm run dev
```

Stop the database (data in the named volume is kept):

```bash
npm run db:down
```

Other useful commands:

```bash
npm run db:status
npm run db:studio
```

For local development, `DATABASE_URL` should point at `localhost:5432` / database `nova_lab` (see `.env.example`).

## Getting Started

```bash
npm run db:up
npx prisma migrate deploy
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Production (Vercel + managed PostgreSQL)

1. Provision a managed Postgres database (Neon, Supabase, etc.).
2. In the Vercel project, set:
   - `DATABASE_URL` — production Postgres connection string
   - `NEXT_PUBLIC_APP_URL` — `https://<your-production-domain>`
3. Deploy from git. The `build` script runs `prisma generate`, `prisma migrate deploy`, then `next build`.
4. Do not commit `.env` files. Use `.env.example` as the template only.

WebMCP tools register in the browser via `document.modelContext` on the deployed HTTPS origin; no WebMCP localhost URLs are hardcoded.

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
