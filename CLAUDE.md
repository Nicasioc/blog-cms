# CLAUDE.md

This file gives coding agents a concise set of project conventions for the shared Payload CMS backing every white-label tenant blog. Adapted from the blog repo's `CLAUDE.md`, with the parts that don't map onto a Payload project (its layered `app/application/domain/persistence` structure) replaced by Payload's own idiomatic conventions instead of forced onto it.

## Core Principles

- Optimize for readability and maintainability over cleverness.
- Keep access-control and hook logic pure and testable wherever possible.
- Favor explicit imports, explicit names, and predictable file placement.
- Prefer small, composable functions over large multi-purpose blocks.
- Make changes that are easy to reason about and easy to review.

## Architecture

This is a Payload CMS config project, not a layered app — structure follows Payload's own conventions rather than the blog's `app → application → domain + persistence` model:

- `src/collections/` — one file per collection (`Posts.ts`, `Tenants.ts`, etc.), each exporting a `CollectionConfig`.
- `src/access/` — reusable access-control functions, shared across collections (e.g. `isTenantMember`, `publishedOrOwner`).
- `src/hooks/` — reusable collection hooks (e.g. the revalidation `afterChange`/`afterDelete` hooks that call the blog's `/api/revalidate`).
- `src/fields/` — reusable field configs shared across collections (e.g. a `tenant` relationship field, an `seo` group).
- `src/payload.config.ts` — composition root; wires collections, plugins, db adapter, storage adapter.

Keep access-control functions and hooks small and pure where possible — a hook that needs a side effect (an outbound `fetch` to the revalidate webhook) should isolate that call behind a small function that's easy to mock in tests, rather than inlining `fetch` deep in hook logic.

## Code Style

- TypeScript everywhere. `const` by default; avoid `let` unless mutation is required.
- Single quotes, no semicolons, trailing commas — enforced by Prettier (`.prettierrc.json`), not manual.
- Keep functions focused and named by intent. Use early returns/guard clauses to reduce nesting.
- Use `===`/`!==`. Avoid nested ternaries — extract a helper function instead.
- Prefer `switch` for multiple discrete branches.
- Prefer pure functions and minimal side effects; don't mutate input objects/arrays.

## Logging

- Never use `console.log`. Payload has a built-in logger (pino-based) available as `payload.logger` (or `req.payload.logger` inside access-control functions and hooks, which receive `req`) — use that instead of building a separate logging utility.
- Use `.error()` for fatal failures, `.warn()` for recoverable issues (e.g. a revalidation webhook call that failed but shouldn't block the write).

## Naming and File Conventions

- Collection config files: PascalCase, matching the collection name (`Posts.ts`, `Tenants.ts`), living in `src/collections/`.
- Everything else (access functions, hooks, field configs, utils): camelCase.
- Test files: this template's testing model is integration-first, not colocated unit tests — see Testing Expectations below.

## Testing Expectations

Payload's own tooling (`vitest.config.mts`) is scoped to `tests/int/**/*.int.spec.ts` — integration tests that spin up a real Payload instance (`getPayload({ config })`) against a live Postgres connection and exercise it through the Local API (`payload.find`/`create`/`update`). This is the idiomatic Payload pattern; don't fight it by trying to colocate `.test.ts` files next to collections the way the blog repo does — collections are schema + access-control + hooks, not pure functions you can unit test in isolation from a database.

- **Every collection** gets at least one test in `tests/int/` covering: public read only returns published/approved docs, write requires auth, and — once the multi-tenant plugin is wired in — a tenant's credentials can't read/write another tenant's docs.
- **Hooks** (e.g. revalidation) should have their outbound side effect (the `fetch` to `/api/revalidate`) mocked in tests, asserting it's called with the right URL/payload when a doc changes — not asserting against a real webhook.
- **Playwright e2e** (`tests/e2e/`) is reserved for genuinely UI-dependent flows (Admin UI login, tenant switcher, creating a post through the form) — these are slower and need a running server, so keep them for what actually requires a browser rather than duplicating what an integration test already covers.

## Environment Access

Unlike the blog repo, there's no centralized env module here — `payload.config.ts` reading `process.env.DATABASE_URL` / `process.env.PAYLOAD_SECRET` / `process.env.BLOB_READ_WRITE_TOKEN` directly is Payload's own idiomatic bootstrap pattern, not a violation to fix. Keep env reads confined to `payload.config.ts` and don't scatter `process.env` access into collection/hook/access files — pass values down through config instead.

**Local `.env`'s `DATABASE_URL` must always point at the Neon `development` branch, never `production`.** This isn't a style preference — a real incident happened when a local command ran without an explicit override and picked up a production connection string sitting in `.env`, silently push-modifying production's schema. Get connection strings via the direct Neon API (`GET /projects/{id}/branches/{branch_id}/endpoints` + `/roles/{role}/reveal_password`, or `GET /projects/{id}/connection_uri?branch_id=...`) and verify the returned host against `neonctl branches list` before trusting it — `neonctl connection-string --branch-id <X>` was independently confirmed to return the wrong branch's connection string in this project.

**Env var name must match what Vercel's Neon-Managed Integration actually provisions.** It sets `DATABASE_URL` / `DATABASE_URL_UNPOOLED` in Production, not `POSTGRES_URL` (a leftover convention from the original `with-vercel-postgres` scaffold's now-deprecated `@vercel/postgres` package). This caused a real outage: `@payloadcms/db-postgres`'s plain `pg.Pool` uses exactly the `connectionString` it's given, so reading `POSTGRES_URL` (unset) silently fell back to `pg`'s localhost default, `ECONNREFUSED 127.0.0.1:5432` on every request. The previous `@payloadcms/db-vercel-postgres` adapter masked this because `@vercel/postgres` does its own internal env auto-detection across several var names regardless of what config is passed. If the connection string env var is ever renamed again, grep for `DATABASE_URL` across `src/payload.config.ts`, `.env.example`, and both GitHub Actions workflows — nothing auto-syncs these.

## Linting and Formatting

- `pnpm run lint` / `pnpm run lint:fix` — ESLint (`eslint-config-next`, flat config).
- `pnpm run format` / `pnpm run format:check` — Prettier.
- `pnpm run typecheck` — `tsc --noEmit`.

### Pre-commit Hook

Husky + lint-staged run on every commit (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs` → ESLint --fix + Prettier; `.json`, `.css`, `.md` → Prettier).

### Pre-push Hook

Runs `lint` + `typecheck` only — not the full test suite. `test:int` needs a live Postgres connection and `test:e2e` needs a running server, both too heavy for a local pre-push gate; full tests run in CI instead (see below).

### CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every push to `main` and every PR: lint + typecheck + format check in one job, `payload migrate` against a fresh Postgres service container followed by `test:int` in another.

### Database migrations and deployment

**Schema changes are migration-only, everywhere** (`push: false` in `payload.config.ts`) — never rely on dev-mode auto-push, including locally. Any collection/field change: `payload migrate:create <name>` run locally against a Neon `development` branch (never `production` — see Environment Access below), review the generated SQL, commit the migration file.

**Vercel's build step cannot run `payload migrate`** — this is a confirmed upstream limitation ([payloadcms/payload#14894](https://github.com/payloadcms/payload/issues/14894)): the Neon serverless driver's WebSocket connection doesn't work inside Vercel's build sandbox (fails with `wss://localhost/v2` / `ECONNREFUSED`), regardless of how correct the connection string is — confirmed by reproducing the exact same connection working fine locally with the identical credentials. `vercel.json`'s `buildCommand` is therefore just `pnpm build`, not the template's own `pnpm run ci` script.

Instead, `.github/workflows/migrate-production.yml` runs `payload migrate` against production on every push to `main`, using `PRODUCTION_POSTGRES_URL`/`PRODUCTION_PAYLOAD_SECRET` repo secrets — a plain GitHub Actions runner has no such WebSocket restriction. **Known limitation**: this runs independently of (not gated before) Vercel's own auto-deploy on the same push, so there's a brief window where newly deployed code could hit a database that hasn't finished migrating yet. Low-stakes today (no production traffic), but worth revisiting — e.g. disabling Vercel's auto-deploy and triggering `vercel deploy --prod` from this same workflow after a successful migration — before this matters for real.

### Commit Message Convention

Conventional Commits, enforced by commitlint via the `commit-msg` hook — same format and types as the blog repo (`feat`, `fix`, `docs`, `refactor`, `test`, `chore`, etc.), e.g. `feat(collections): add Tenants collection`.

## Documentation

Payload ships breaking changes frequently, and this template's `main`-branch source can drift ahead of (or behind) whatever version is actually pinned/installed — this isn't hypothetical: the initial scaffold shipped with a `payload build` CLI command that no longer exists in 3.87.x, a `storage` config field that had moved into `plugins`, and an export (`generatePayloadViewport`) that had been removed, all caught only by actually running `typecheck`/`build` rather than trusting the scaffold. Before relying on a Payload API shape from memory or from what an older example shows, check it against the current installed version:

- Search `payloadcms.com/docs` (via `WebSearch`/`WebFetch`) for the API in question.
- Cross-check against `node_modules/payload/package.json`'s `version` and the relevant package's own `.d.ts`/`exports` map when something doesn't typecheck — that's the ground truth for what's actually installed, faster than searching when the docs and installed version disagree.

## Internal Docs

`docs/` has deeper reference material than this file — read it before making non-trivial changes:

- `docs/architecture.md` — collections, access control model, hooks, plugins, the database adapter, the admin import map.
- `docs/environment-variables.md` — every env var, what reads it, and the `DATABASE_URL`-not-`POSTGRES_URL` gotcha.
- `docs/database-and-migrations.md` — Neon branch structure, the migration-only workflow, why migrations don't run in Vercel's build step.
- `docs/deployment.md` — Vercel project setup, both GitHub Actions workflows.
- `docs/tenant-onboarding.md` — how to seed a new tenant today, and the trap to avoid.
- `docs/incidents.md` — chronological root-cause log for every non-obvious guardrail above; read this if a rule here seems overly cautious and you want to know why it exists.

## Project Tracking

Work is tracked in Linear under the **blog** team, project _"Migrate WordPress → Payload CMS + Neon Postgres"_, Milestone 1 (issues BLO-68 through BLO-75, all Done as of this writing; BLO-83/84/85 are open non-blocking follow-ups). Milestone 2 (BLO-76 onward) is in the blog repo.
