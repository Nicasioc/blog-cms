# Database & Migrations

## Neon project structure

One Neon project, two branches:

- **`development`** — what local `.env` should always point at.
- **`production`** — what Vercel's live deployment and `migrate-production.yml` use.

Vercel also auto-provisions its own ephemeral branches for preview deployments (via the Neon-Managed Integration) — these are separate from `development` and not something local work should ever point at.

The project was fully reset once (see `docs/incidents.md`) after local commands accidentally push-modified production's schema. Both branches currently hold the same migration history, applied from a clean, empty starting point.

## Migration-only workflow

`push: false` is set on the Postgres adapter in `payload.config.ts`, in **every** environment — local dev, CI, and production. Payload's own docs warn against mixing dev-mode push with migrations on the same project; forcing migration-only everywhere means schema changes only ever happen through committed, reviewed migration files, in every environment, with no exceptions.

**Making a schema change:**

1. Change the collection/field config.
2. `pnpm payload migrate:create <name>` — run locally, against `development`.
3. Review the generated SQL in `src/migrations/`.
4. Commit the migration file alongside the config change.
5. Push. CI applies it to the disposable per-run Postgres container before running `test:int`. `migrate-production.yml` applies it to the real `production` branch on push to `main` (see `docs/deployment.md`).

Never rely on push-then-forget. Never run `payload migrate` (or anything else) against a connection string you haven't verified the host of first.

## Why migrations don't run in Vercel's build step

Payload's own build-time `payload migrate` (the template's original `pnpm run ci` = `payload migrate && pnpm build`) fails specifically in Vercel's build sandbox with `wss://localhost/v2` / `ECONNREFUSED` — a known upstream limitation ([payloadcms/payload#14894](https://github.com/payloadcms/payload/issues/14894)). The identical command with the identical connection string works fine locally and in GitHub Actions; it's specific to Vercel's build environment.

Because of this, `vercel.json`'s `buildCommand` is plain `pnpm build` — migrations are applied by a separate GitHub Actions workflow instead (`migrate-production.yml`, see `docs/deployment.md`), not gated before Vercel's own auto-deploy on the same push. This means there's a brief window on every push to `main` where newly deployed code could hit a database that hasn't finished migrating yet. Low-stakes today (no production traffic), worth revisiting before it matters for real — e.g. disabling Vercel's auto-deploy and triggering `vercel deploy --prod` from the same workflow after a successful migration.

## Checking migration state

```bash
pnpm payload migrate:status
```

Shows every migration file and whether it's been applied to whatever `DATABASE_URL` is currently in scope. Run this after pointing `.env` at a different branch to confirm you're where you think you are, before running anything else.
