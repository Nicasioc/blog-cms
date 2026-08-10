# Tenant Onboarding

## What a tenant needs

One `Tenants` doc plus one `Users` doc (with an API key) scoped to it:

- **`Tenants`**: `name`, `slug` (unique), `blogUrl` (the tenant's deployed blog URL), `revalidateSecret` (must match that tenant's `REVALIDATE_SECRET` env var in the blog repo — used to authenticate the ISR revalidation webhook, see `docs/architecture.md`'s Hooks section).
- **`Users`**: `email`, `roles: ['editor']` (not `admin` — `admin` grants cross-tenant access, which a tenant's own API key should never have), `tenants: [{ tenant: <tenant id> }]`, `enableAPIKey: true`, `apiKey: <a generated plaintext key>`.

**`enableAPIKey: true` does not auto-generate a key.** Payload only encrypts/stores whatever plaintext value is provided in `data.apiKey` — you have to generate it yourself (e.g. `crypto.randomBytes(32).toString('hex')`) and pass it explicitly on create.

## Current process (manual, one-off script)

`scratch-seed-debate-cuervo.ts` at the repo root (untracked — see BLO-85) is the script used to seed the pilot tenant. It's idempotent: re-running it finds the existing tenant/user by slug/email and updates rather than duplicates, generating a fresh API key each time.

```bash
pnpm exec tsx --require dotenv/config scratch-seed-debate-cuervo.ts
```

`--require dotenv/config` is required — the script itself doesn't load `.env` (only `playwright.config.ts` and `vitest.setup.ts` do), and Payload's own CLI (`pnpm payload ...`) does its own internal `.env` loading that a raw `tsx` invocation doesn't get for free.

## The trap: running this against production

The script uses whatever `DATABASE_URL`/`PAYLOAD_SECRET` are in scope when it runs. Two ways this goes wrong, both of which have actually happened on this project:

1. **API key encrypted under the wrong secret.** Payload encrypts/verifies API keys using `PAYLOAD_SECRET`. If you seed against production's database using your _local_ `PAYLOAD_SECRET` (e.g. by only overriding `DATABASE_URL` and forgetting `PAYLOAD_SECRET`, or vice versa), the key gets stored correctly but silently fails to authenticate against the live app, which verifies it with the _real_ production secret. `GET /api/users/me` with the key returns `{"user": null}` — no error, just silent failure.
2. **Wrong database entirely.** Vercel's dashboard can show multiple connection-string-shaped values across environments/scopes, and it's easy to copy the wrong one. This produces confusing symptoms (e.g. `payload migrate:status` showing fewer migrations applied than production actually has) that look like a migration problem but are actually a wrong-target problem. Always sanity-check with `pnpm payload migrate:status` against whatever `DATABASE_URL` you're about to use — it should show every migration file as applied before you trust it's really production.

**Full incident writeup**: `docs/incidents.md`.

## Recommended for future tenants (not yet built — BLO-85)

Don't repeat the local-`.env`-pointed-at-production pattern. Prefer a `workflow_dispatch` GitHub Actions job that uses the existing `PRODUCTION_POSTGRES_URL`/`PRODUCTION_PAYLOAD_SECRET` repo secrets directly — the same secrets `migrate-production.yml` already uses — so seeding a new tenant never requires hand-copying production credentials into a local `.env` file at all. This also naturally generalizes `scratch-seed-debate-cuervo.ts` from a hardcoded one-off into a real `scripts/seed-tenant.ts` accepting tenant name/slug as arguments.
