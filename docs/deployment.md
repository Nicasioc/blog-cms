# Deployment & CI/CD

## Vercel

One Vercel project (`blog-cms`), deployed via the GitHub integration on every push to `main`. Connected integrations:

- **Neon-Managed Integration** — provisions `DATABASE_URL`/`DATABASE_URL_UNPOOLED` (see `docs/environment-variables.md` for why it's `DATABASE_URL` and not `POSTGRES_URL`).
- **Cloudinary** — media storage for the `media` collection. Not an auto-provisioned Vercel resource: `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` are set by hand in the Vercel dashboard (Production **and** Preview — env vars bake in at build time). Without all three the storage plugin no-ops and Payload falls back to local-disk storage.

`vercel.json`:

```json
{ "$schema": "https://openapi.vercel.sh/vercel.json", "buildCommand": "pnpm build" }
```

Plain `pnpm build` (not `pnpm run ci`) — migrations are deliberately **not** run as part of Vercel's build. See `docs/database-and-migrations.md` for why.

**Deployment protection**: Vercel Authentication (SSO) was disabled on this project so the REST API is reachable by tenant blog apps without needing a bypass token — SSO protection blocks _all_ traffic at the platform level, before Payload's own access control ever runs, which defeats the point of `publicRead`/`publishedOrLoggedIn` access rules. Tracked for a follow-up security review: BLO-83.

**Env vars are baked in at build time**, not read live from the dashboard on every request. If a dashboard value changes (e.g. Neon rotates a compute endpoint), it only takes effect on the _next_ deployment — the currently-running one keeps using whatever was current when it was built. This matters when debugging "but the dashboard says X" — check what was actually live at the deployment's build time, not just the dashboard's current state.

## GitHub Actions

Two workflows, both triggered on push to `main` (and `ci.yml` also on pull requests):

### `ci.yml`

- **`lint-typecheck`** — `pnpm run lint`, `pnpm run typecheck`, `pnpm run format:check`.
- **`test-int`** — spins up a disposable `postgres:17` service container, runs `pnpm payload migrate` against it (required now that `push: false` is set globally — the container starts empty every run), then `pnpm run test:int`.

### `migrate-production.yml`

Runs `pnpm payload migrate` against the real `production` Neon branch, using `PRODUCTION_POSTGRES_URL`/`PRODUCTION_PAYLOAD_SECRET` repo secrets (mapped to `DATABASE_URL`/`PAYLOAD_SECRET` env vars for the job — see `docs/environment-variables.md`). Exists because Vercel's own build step can't run migrations (see `docs/database-and-migrations.md`). Runs independently of, not gated before, Vercel's own auto-deploy on the same push.

## Deploying a change

Normal flow: commit → push to `main` → both GitHub Actions workflows and a Vercel deployment fire automatically. No manual deploy step needed for ordinary code/config changes.

For diagnosing a deployment-specific issue, useful things to check (all via Vercel's dashboard or the `vercel` MCP tools, if available):

- **Build logs** — for build-time failures.
- **Runtime logs / runtime errors** — for request-time failures, filterable by deployment ID.
- **Deployment list** — each deployment's commit SHA and whether it's the one currently aliased to the production domain.

A useful diagnostic technique used more than once during this project's setup: a temporary, narrowly-scoped `console.error` logging only _which_ env vars are present (never their values), deployed, checked via runtime logs, then reverted — faster than guessing when direct dashboard/API access to env var values isn't available.
