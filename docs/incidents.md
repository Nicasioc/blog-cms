# Incident Log

Chronological record of significant bugs/incidents during this project's setup, root causes, and fixes. Kept so the reasoning behind non-obvious guardrails (in `CLAUDE.md`, `docs/environment-variables.md`, `docs/database-and-migrations.md`) doesn't get lost — each entry links to the doc it justifies.

## 1. Accidental production writes from local commands

**Symptom**: local commands (`generate:types`, `test:int`, a `payload migrate` run) ended up executing against the real Neon `production` branch instead of an isolated branch.

**Root cause**: local `.env` had the real production connection string in it (no isolated `development` branch existed yet), and `neonctl connection-string --branch-id <X>` was independently confirmed to return the **wrong branch's** connection string regardless of which branch was requested — verified by cross-checking against the Neon REST API's `/branches/{id}/endpoints`, which correctly returned differing hosts per branch.

**Fix**: since the project was greenfield (no real content yet), reset cleanly rather than reverse-engineering the accidental state — deleted and recreated the Neon project entirely, split into `development`/`production` branches, regenerated a single clean migration against the empty database, applied to both branches.

**Structural guardrails put in place** (see `docs/database-and-migrations.md`, `docs/environment-variables.md`):

- Local `.env`'s `DATABASE_URL` always points at `development`, never `production`.
- `push: false` set on the Postgres adapter in every environment — schema changes only happen through committed, reviewed migration files, everywhere.
- CI's `test:int` job runs `payload migrate` before the test suite (needed once push-mode stopped being available as a fallback).
- Prefer the direct Neon REST API over `neonctl connection-string` for getting connection strings; always cross-check the returned host against `neonctl branches list` before running anything mutating.

## 2. `wss://localhost` / `ECONNREFUSED` from the deprecated Postgres adapter

**Symptom**: `payload migrate` failing during Vercel's build step, and — separately — intermittent failures in the live Admin UI, both with the same `wss://localhost/v2` / `ECONNREFUSED` signature.

**Root cause**: `@payloadcms/db-vercel-postgres` depends on `@vercel/postgres`, a package Vercel has stopped maintaining in favor of direct Neon integration (confirmed via [payloadcms/payload discussion #13404](https://github.com/payloadcms/payload/discussions/13404)). The build-step failure specifically is a known upstream limitation ([payloadcms/payload#14894](https://github.com/payloadcms/payload/issues/14894)) — Vercel's build sandbox can't complete the WebSocket-based Neon connection `payload migrate` needs, even with a correct connection string. The identical adapter code never failed once in dozens of local runs against the same database — this was specific to Vercel's environment.

**Fix**:

- Moved migration execution out of Vercel's build step entirely, into a separate GitHub Actions workflow (`migrate-production.yml`) — see `docs/deployment.md`.
- Switched the database adapter from `@payloadcms/db-vercel-postgres` to `@payloadcms/db-postgres` (plain `pg`/TCP, no WebSocket driver) — this app runs as ordinary Node.js serverless functions, which support plain TCP natively.

## 3. `DATABASE_URL` vs `POSTGRES_URL` — the adapter swap's regression

**Symptom**: immediately after the adapter swap above, every route started returning `{"message": "There was an error initializing Payload"}` (500). Runtime logs showed the real error: `connect ECONNREFUSED 127.0.0.1:5432` — the signature of `pg.Pool` receiving an empty `connectionString`.

**Root cause**: Vercel's Neon-Managed Integration provisions the connection string as `DATABASE_URL` (and `DATABASE_URL_UNPOOLED`) in this project, **not** `POSTGRES_URL`. `POSTGRES_URL` was a leftover from the original `with-vercel-postgres` scaffold template's naming convention for the now-deprecated `@vercel/postgres` package. The old adapter has its own internal env auto-detection across several var names, so it silently found `DATABASE_URL` regardless of what config was explicitly passed — masking the mismatch for as long as that adapter was in use. `@payloadcms/db-postgres`'s plain `pg.Pool` uses exactly what's passed, so reading the unset `POSTGRES_URL` fell back to `pg`'s localhost default.

**How it was diagnosed**: a temporary, narrowly-scoped runtime diagnostic — `console.error` logging only _which_ Postgres/Neon-related env var _names_ were present (never values) — deployed, checked via Vercel runtime logs, then reverted once the cause was confirmed. Direct comparison against a sibling deployment still running the old adapter (which connected fine) helped isolate that this was adapter-specific behavior, not a genuinely missing/rotated env var.

**Fix**: renamed the var to `DATABASE_URL` everywhere it's referenced — `payload.config.ts`, `.env`/`.env.example`, both GitHub Actions workflows, docs. See `docs/environment-variables.md`.

## 4. Stale Admin UI import map

**Symptom**: Admin UI broken, with `getFromImportMap: PayloadComponent not found in importMap` in runtime logs, specifically for `@payloadcms/plugin-multi-tenant/rsc#TenantSelectionProvider`.

**Root cause**: `src/app/(payload)/admin/importMap.js` is a generated file, committed to the repo, listing every client component the Admin UI needs. It was never regenerated after `@payloadcms/plugin-multi-tenant` and `@payloadcms/plugin-seo` were added — it only had components from the original scaffold.

**Fix**: `pnpm payload generate:importmap`, then commit the result. **This is not automatic** — see `docs/architecture.md`'s note on the import map for when to re-run it.

## 5. API key seeded under the wrong `PAYLOAD_SECRET`

**Symptom**: the pilot tenant's seeded API key returned `{"user": null}` on `GET /api/users/me` — silent auth failure, no error.

**Root cause**: the seed script was run locally against production's database, but using the _local_ `PAYLOAD_SECRET` rather than production's actual secret. Payload encrypts/verifies API keys using this secret, so the key was stored correctly but couldn't be verified by the live app, which uses a different secret value.

**Fix**: re-ran the (idempotent) seed script with the real production `DATABASE_URL`/`PAYLOAD_SECRET`, pulled directly from the Vercel dashboard. See `docs/tenant-onboarding.md`.

## 6. Wrong database during the fix for #5

**Symptom**: while fixing #5, a first attempt at re-seeding printed `Created tenant: 1` (not "already exists") and then failed with `relation "users_tenants" does not exist` — a database that had never had the multi-tenant migration applied.

**Root cause**: the `DATABASE_URL` value copied from the Vercel dashboard was, per direct confirmation, a mis-copied value pointing at a development-adjacent database, not production — despite deliberately filtering to the "Production" scope when copying it. This is the same class of mistake incident #1's guardrails were meant to prevent, but it recurred here because those guardrails assume `.env` never intentionally points at production at all — they don't cover the case of a deliberate, temporary override for a one-off script.

**Fix**: re-copied the correct value (confirmed via `pnpm payload migrate:status` showing both migrations applied, and the seed script reporting "Tenant already exists" rather than creating a new one). `.env` was reverted to `development` immediately afterward.

**Follow-up** (tracked as BLO-84, BLO-85, both non-blocking): clean up the stray tenant/user row left in the wrong database, and replace the ad-hoc "temporarily edit `.env` and hand-copy from the dashboard" pattern with a controlled `workflow_dispatch` path using the existing production GitHub secrets — see `docs/tenant-onboarding.md`.

## 7. Vercel Blob → Cloudinary for media storage (2026-08-28)

**Change**: replaced `@payloadcms/storage-vercel-blob` with an in-repo Cloudinary storage adapter (`src/storage/`) built on `@payloadcms/plugin-cloud-storage`. Motivation was vendor migration only — no Cloudinary transformations, plain passthrough delivery.

**Why hand-rolled, not `payload-storage-cloudinary`**: that community plugin (a) **throws at config load when credentials are absent**, which would break CI's `payload migrate` + `test:int` and `migrate-production.yml` (both run with no storage creds); (b) always injects ~8 schema columns (and re-declares `filesize`); (c) hard-sets `disablePayloadAccessControl`, turning `doc.url` into a raw `res.cloudinary.com` URL — a blog-frontend behavior change. It also pulls `@payloadcms/plugin-cloud-storage` at a newer minor than the repo's exact-`3.87.1` pin. The in-repo wrapper instead mirrors `vercelBlobStorage`'s `!token` contract: **missing any `CLOUDINARY_*` var → the plugin is a no-op and Payload falls back to local-disk storage**, so CI and the production-migrate workflow are unaffected.

**Schema cost**: one nullable column, `media.hosting_id` (migration `20260828_223549_add_media_hosting_id`), holding the Cloudinary `public_id`. The column name is deliberately provider-agnostic so a future image-host swap doesn't need another migration. `handleUpload` persists it; `handleDelete` / `staticHandler` read it rather than re-deriving a URL, which keeps delivery correct for `raw` assets (PDF/zip) and multi-dot filenames. The field is declared on `Media.ts` (not via `adapter.fields`) so the schema is identical whether or not the plugin is enabled.

**Gotcha 1 — restricted API key**: the first API key provided could `ping` and read the Admin API but returned `403 "Request forbidden due to missing permissions (actions=[\"create\"])"` on every upload. Cloudinary keys can be permission-scoped; a media-storage key needs `create`. Verified by isolating: Admin API `ping`/`resources` worked, `uploader.upload` 403'd. Fixed by upgrading the key's permissions.

**Gotcha 2 — dynamic folder mode**: the account is in `folder_mode: "dynamic"`. The adapter encodes the tenant folder into `public_id` (`media/<tenantId>/<file>`), so **delivery URLs are correct**, but assets show as flat names like `media/2/foo` in the Cloudinary Media Library rather than nested folders. Acceptable for delivery; pass `asset_folder` as a follow-up if UI folders are wanted.

**Gotcha 3 — PDF/ZIP delivery blocked for `image` resources**: PDFs were first uploaded as `resource_type: 'image'` (so Cloudinary would report `application/pdf`), but Cloudinary **blocks delivery of PDF/ZIP `image` assets by default** — the `/api/media/file/<pdf>` proxy got a `401` from `res.cloudinary.com` (surfacing as a `502`). Fixed in the adapter, not the account: PDF and ZIP now go through as `resource_type: 'raw'` (never blocked), and `staticHandler` restores the real `Content-Type` from an extension→MIME map since `raw` is otherwise served as `application/octet-stream`. `staticHandler` HTTP behaviour was then verified end-to-end against a live dev server + real Cloudinary: PNG/SVG/PDF all `200` with the right `Content-Type` (SVG `image/svg+xml` + `script-src 'none'` CSP; PDF `application/pdf` + inline `Content-Disposition`), `Range` → `206` + `Content-Range`, `If-None-Match` → `304`.

**Reminder**: swapping the storage plugin changed the generated Admin UI import map — `pnpm payload generate:importmap` was re-run and the `VercelBlobClientUploadHandler` entry dropped (see incident #4).

## 8. Security review — re-enabling Vercel protection behind a custom domain (BLO-83, 2026-08-29)

[BLO-83](https://linear.app/vex-agency/issue/BLO-83). Vercel "Vercel Authentication" was
disabled globally on `blog-cms` during setup because it gates the whole deployment before
Payload's access control runs, breaking the tenant blogs' public REST reads. Now that
`blog-cms` has a custom domain (`admin.vex-agency.com`), protection was re-enabled as
**Standard Protection** (`prod_deployment_urls_and_all_previews`): the immutable
`*.vercel.app` deployment URLs and all preview deployments require the `vex-agency` team's
SSO; the production custom domain stays public for the blog. The blog's `PAYLOAD_API_URL`
was repointed from `blog-cms-snowy.vercel.app` to `admin.vex-agency.com` first (env var +
`next.config.ts` rewrite fallback) so there was no outage window.

**Access-control review** (Payload's rules are now the only layer in front of the public
REST API):

- **Accepted, follow-up filed** — `publicRead` (`() => true`) on `authors`/`categories`/
  `tags`/`media` and `publishedOrLoggedIn` on `posts`/`pages` are **not tenant-scoped for
  anonymous requests**. `payloadClient` reads content anonymously and self-scopes with a
  `tenant` `where` clause; the CMS does not enforce it. So the public API lets anyone
  enumerate every white-label tenant's authors/taxonomy/media (and any tenant's _published_
  posts/pages). Low sensitivity (sports-blog content), and preview/deployment URLs are now
  SSO-locked, so this was accepted for now; the real fix (require the per-tenant API key on
  all reads + a `baseListFilter` so a scoped key only sees its own tenant) is a follow-up.
- **Fixed — anonymous comment tenancy.** `Comments.create` is public and
  `enforceTenantAssignment` no-ops for anonymous requests, so a public POST could set
  `tenant` to any id while `post` pointed at another tenant's post. New `beforeChange` hook
  `src/hooks/deriveCommentTenant.ts` derives `tenant` from the referenced post on create
  and drops any client value.
- **Fixed — GraphQL surface.** The playground/introspection are already off in production
  by Payload's defaults, but the `POST /api/graphql` endpoint was live and unused (the blog
  is REST-only). `graphQL: { disable: true }` in `payload.config.ts` makes it return `404`.
- **Noted, no change** — login lockout runs on Payload defaults (`maxLoginAttempts: 5`,
  `lockTime: 10m`); `Comments.authorEmail` has field-level `read: user-only` so emails
  aren't leaked; `enforceTenantAssignment` still guards authenticated non-admin users
  (covered by `tests/int/accessControl.int.spec.ts`).
