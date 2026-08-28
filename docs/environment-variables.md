# Environment Variables

There's no centralized env module in this repo (unlike the blog repo) — `payload.config.ts` reads `process.env` directly, which is Payload's own idiomatic bootstrap pattern here, not a violation to fix. Env reads stay confined to `payload.config.ts`; collection/hook/access files never read `process.env` directly, values get passed down through config instead.

## Reference

| Variable                | Purpose                                                                                                            | Where it's set                                                                                                                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`          | Postgres connection string, read by `postgresAdapter`'s `pool.connectionString`                                    | Local: `.env`. Vercel Production: auto-injected by the Neon-Managed Integration. CI: `ci.yml` (points at the ephemeral container). Production migrations: GitHub Actions secret `PRODUCTION_POSTGRES_URL`, mapped to `DATABASE_URL` in `migrate-production.yml`. |
| `PAYLOAD_SECRET`        | Encrypts sessions, API keys, and other sensitive fields                                                            | Local: `.env`. Vercel Production: set directly in the dashboard. Production migrations: GitHub Actions secret `PRODUCTION_PAYLOAD_SECRET`.                                                                                                                       |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary account cloud name, read by the in-repo `cloudinaryStorage` plugin (`src/storage/cloudinaryStorage.ts`) | Vercel Production **and** Preview: set by hand in the dashboard. Local: `.env` only when testing media uploads. **Not** set in CI or `migrate-production.yml`.                                                                                                   |
| `CLOUDINARY_API_KEY`    | Cloudinary API key, same consumer                                                                                  | Same as above.                                                                                                                                                                                                                                                   |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret, same consumer. Never logged.                                                                | Same as above.                                                                                                                                                                                                                                                   |

That's the full list — five variables, all read in exactly one place (`payload.config.ts`). Unlike `DATABASE_URL` / `PAYLOAD_SECRET` (read as `process.env.X || ''`), the three `CLOUDINARY_*` vars are passed through as `undefined` when unset so the storage plugin can detect absent credentials and disable itself — the same on/off contract the old `@payloadcms/storage-vercel-blob` plugin had with `BLOB_READ_WRITE_TOKEN`. With the plugin disabled, media uploads fall back to Payload's local-disk storage.

## `DATABASE_URL`, not `POSTGRES_URL`

**This is the one to get right.** Vercel's Neon-Managed Integration provisions the connection string as `DATABASE_URL` (and `DATABASE_URL_UNPOOLED`) in this project — not `POSTGRES_URL`. `POSTGRES_URL` was the naming convention of the original `with-vercel-postgres` scaffold template's now-deprecated `@vercel/postgres` package, and using it caused a real production outage (every route returning "There was an error initializing Payload") when the DB adapter was swapped to a driver that doesn't have that package's internal env auto-detection fallback. Full story in `docs/incidents.md`.

If the connection string env var is ever renamed again for any reason, grep for `DATABASE_URL` across `src/payload.config.ts`, `.env.example`, and both GitHub Actions workflows — nothing auto-syncs these.

## Local `.env` must point at `development`, never `production`

This is a structural rule, not a preference — a real incident happened when a local command picked up a production connection string sitting in `.env` and silently push-modified production's schema (see `docs/incidents.md` and `docs/database-and-migrations.md`).

`.env` should, at rest, always look like this:

```bash
DATABASE_URL=postgresql://<...>@<development-branch-host>.../neondb?sslmode=require
PAYLOAD_SECRET=local-dev-secret-do-not-use-in-production-xyz123
```

If you ever need to run something against production intentionally (seeding, one-off admin scripts), **don't** edit `.env` in place and hand-copy values from the Vercel dashboard — see `docs/tenant-onboarding.md` for why, and prefer a `workflow_dispatch` GitHub Actions job using the existing `PRODUCTION_POSTGRES_URL`/`PRODUCTION_PAYLOAD_SECRET` repo secrets instead. If you do edit `.env` temporarily, revert it back to the development values immediately afterward and verify with `pnpm payload migrate:status` (should show both migrations applied against the development branch) before doing anything else locally.

## Getting a Neon connection string

Prefer the direct Neon REST API over `neonctl connection-string` — the CLI helper was independently confirmed to return the _wrong branch's_ connection string in this project (see `docs/incidents.md`).

```bash
# List endpoints for a branch
GET /projects/{project_id}/branches/{branch_id}/endpoints

# Reveal a role's password
GET /projects/{project_id}/roles/{role_name}/reveal_password

# Or, directly:
GET /projects/{project_id}/connection_uri?branch_id=X&database_name=Y&role_name=Z
```

Always cross-check the returned host against `neonctl branches list` (or the `/branches` API) before running anything mutating against it.
