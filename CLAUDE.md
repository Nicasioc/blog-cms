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

Unlike the blog repo, there's no centralized env module here — `payload.config.ts` reading `process.env.POSTGRES_URL` / `process.env.PAYLOAD_SECRET` / `process.env.BLOB_READ_WRITE_TOKEN` directly is Payload's own idiomatic bootstrap pattern, not a violation to fix. Keep env reads confined to `payload.config.ts` and don't scatter `process.env` access into collection/hook/access files — pass values down through config instead.

## Linting and Formatting

- `pnpm run lint` / `pnpm run lint:fix` — ESLint (`eslint-config-next`, flat config).
- `pnpm run format` / `pnpm run format:check` — Prettier.
- `pnpm run typecheck` — `tsc --noEmit`.

### Pre-commit Hook

Husky + lint-staged run on every commit (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs` → ESLint --fix + Prettier; `.json`, `.css`, `.md` → Prettier).

### Pre-push Hook

Runs `lint` + `typecheck` only — not the full test suite. `test:int` needs a live Postgres connection and `test:e2e` needs a running server, both too heavy for a local pre-push gate; full tests run in CI instead (see below).

### CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every push to `main` and every PR: lint + typecheck + format check in one job, `test:int` against a Postgres service container in another.

### Commit Message Convention

Conventional Commits, enforced by commitlint via the `commit-msg` hook — same format and types as the blog repo (`feat`, `fix`, `docs`, `refactor`, `test`, `chore`, etc.), e.g. `feat(collections): add Tenants collection`.

## Documentation

Payload ships breaking changes frequently, and this template's `main`-branch source can drift ahead of (or behind) whatever version is actually pinned/installed — this isn't hypothetical: the initial scaffold shipped with a `payload build` CLI command that no longer exists in 3.87.x, a `storage` config field that had moved into `plugins`, and an export (`generatePayloadViewport`) that had been removed, all caught only by actually running `typecheck`/`build` rather than trusting the scaffold. Before relying on a Payload API shape from memory or from what an older example shows, check it against the current installed version:

- Search `payloadcms.com/docs` (via `WebSearch`/`WebFetch`) for the API in question.
- Cross-check against `node_modules/payload/package.json`'s `version` and the relevant package's own `.d.ts`/`exports` map when something doesn't typecheck — that's the ground truth for what's actually installed, faster than searching when the docs and installed version disagree.

## Project Tracking

Work is tracked in Linear under the **blog** team, project _"Migrate WordPress → Payload CMS + Neon Postgres"_, Milestone 1 (issues BLO-68 through BLO-75).
