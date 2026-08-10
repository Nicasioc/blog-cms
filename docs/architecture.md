# Architecture

This is a standalone Payload CMS service backing every white-label tenant blog. It has no knowledge of any specific tenant's frontend — tenants consume it purely over its REST API, authenticated with a per-tenant API key.

```
Payload CMS (this repo, Next.js-native, Admin UI + REST/GraphQL API)
  ├─ Neon Postgres (one shared project, two branches: development / production)
  ├─ Vercel Blob (media storage)
  └─ @payloadcms/plugin-multi-tenant (tenant field + admin switcher)
        │  REST API, per-tenant API key auth
        ▼
Tenant blog apps (N separate Vercel projects, separate repo)
```

## Folder structure

```
src/
  collections/   One file per collection (CollectionConfig)
  access/        Reusable Access functions, composed into collections
  hooks/         Reusable hook functions, composed into collections
  migrations/    Committed, reviewed SQL migrations (never auto-generated at runtime)
  payload.config.ts
```

There's no `fields/`, `application/`, or `services/` layer here — this is a single-purpose Payload app, not a layered domain app like the blog repo. Collection files own their own field definitions inline; `access/` and `hooks/` exist purely to avoid repeating the same function across multiple collections.

## Collections

| Collection   | Tenant-scoped?            | Notes                                                                                                                          |
| ------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `Tenants`    | —                         | No `access` override — uses Payload's default (`Boolean(user)`, any authenticated user). No tenant field on itself, obviously. |
| `Users`      | via `tenants` array field | `auth.useAPIKey: true`. `roles` is `hasMany` select (`admin` \| `editor`), default `['editor']`. `versions: false`.            |
| `Authors`    | yes                       | Public byline info, separate from `Users` (a `Users` row is a login; an `Authors` row is a public-facing byline).              |
| `Categories` | yes                       |                                                                                                                                |
| `Tags`       | yes                       |                                                                                                                                |
| `Posts`      | yes                       | `versions: { drafts: true }` — native Payload drafts, `_status: 'draft' \| 'published'`. Content is Lexical richText.          |
| `Pages`      | yes                       | Same drafts/versions model as Posts.                                                                                           |
| `Comments`   | yes                       | `status` defaults to `pending`, forced there on create regardless of what's submitted (see Hooks below).                       |
| `Media`      | yes                       | Backed by `@payloadcms/storage-vercel-blob`.                                                                                   |

Tenant scoping on the six tenant-scoped collections (`authors`, `categories`, `tags`, `posts`, `pages`, `comments`, `media`) comes from `@payloadcms/plugin-multi-tenant`, wired in `payload.config.ts`:

```ts
multiTenantPlugin<Config>({
  collections: {
    authors: {},
    categories: {},
    tags: {},
    posts: {},
    pages: {},
    comments: {},
    media: {},
  },
  tenantsArrayField: { includeDefaultField: true },
  userHasAccessToAllTenants: (user) => Boolean(user?.roles?.includes('admin')),
})
```

`userHasAccessToAllTenants` is the admin escape hatch used consistently everywhere tenant scoping is checked (plugin, hooks) — an `admin`-role user bypasses tenant restrictions; an `editor` does not.

## Access control model

Three reusable `Access` functions in `src/access/`, composed per-collection:

- **`publicRead`** — `() => true`. Fully open, no auth. Used for `Authors`/`Categories`/`Tags`/`Media` reads, and `Comments.create` (anonymous comment submission).
- **`publishedOrLoggedIn`** — logged-in users see every doc (drafts included); anonymous requests only see `_status: 'published'`. Used for `Posts`/`Pages` reads.
- **`approvedOrLoggedIn`** — same pattern for `Comments` reads: logged-in sees everything, anonymous sees only `status: 'approved'`.

`Tenants` and `Users` have no `access` override — they fall back to Payload's own default (`({req: {user}}) => Boolean(user)`, i.e. any authenticated user, admin or not). This is why an `editor`-role API key can successfully read its own `Tenants` doc (see `docs/tenant-onboarding.md`).

**Write access** isn't handled by a dedicated `Access` function — it's enforced by the `enforceTenantAssignment` hook (below), not a `create`/`update` access rule. The multi-tenant plugin's own `filterOptions` on the tenant field only filters the _Admin UI dropdown_ — it does **not** enforce anything server-side. This was a real gap, caught while writing `tests/int/accessControl.int.spec.ts`.

## Hooks

| Hook                                                    | Fires on                                          | Purpose                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enforceTenantAssignment`                               | `beforeChange` on all 7 tenant-scoped collections | The actual server-side tenant-write enforcement (see above). No-ops for anonymous requests and for `admin`-role users; rejects a non-admin authenticated user assigning a `tenant` other than one of their own.                                                                   |
| `forcePendingOnCreate`                                  | `beforeChange` on `Comments`                      | Forces `status: 'pending'` on every create, regardless of what a submitter sends — closes the obvious "just submit `status: approved`" bypass on the public comment-submission endpoint.                                                                                          |
| `revalidatePostOrPage` / `revalidatePostOrPageOnDelete` | `afterChange` / `afterDelete` on `Posts`/`Pages`  | See Revalidation below.                                                                                                                                                                                                                                                           |
| `revalidateOnCommentApproval`                           | `afterChange` on `Comments`                       | Same webhook mechanism, fired only when a comment's `status` becomes `approved` (not on raw anonymous submission, which is always `pending`). Looks up the related `Post` and purges that post's slug, since comments don't have their own page.                                  |
| `triggerRevalidate`                                     | (helper, not a Payload hook itself)               | Shared by the three hooks above — looks up the doc's `Tenant` for `blogUrl`/`revalidateSecret`, POSTs `{slug}` to `${blogUrl}/api/revalidate?secret=${revalidateSecret}`. Best-effort: failures are logged via `payload.logger.warn` and never fail the save that triggered them. |

**Revalidation logic detail**: `revalidatePostOrPage` only fires the webhook when the doc's _current_ `_status` is `'published'` — draft saves (including autosaves) never hit a tenant's blog webhook, since drafts aren't publicly cached. If a published doc's `slug` changes, **both** the new and the old slug get purged (otherwise the old URL keeps serving stale content indefinitely).

## Plugins

Configured in `payload.config.ts`, in this order:

1. **`vercelBlobStorage`** — media storage adapter for the `media` collection.
2. **`multiTenantPlugin`** — tenant field + admin tenant switcher (see Collections above).
3. **`seoPlugin`** — adds a `meta` group (`title`/`description`/`image`) to `posts` and `pages`, tabbed UI in the admin.

## Database adapter

`@payloadcms/db-postgres` (plain `pg`/TCP), **not** `@payloadcms/db-vercel-postgres`. The latter depends on the deprecated, unmaintained `@vercel/postgres` package and produced recurring `wss://localhost` connection failures specific to Vercel's serverless environment — see `docs/incidents.md`. This app runs as ordinary Node.js serverless functions (not Edge), which support plain TCP natively; there's no actual need for a WebSocket-based driver.

`idType: 'serial'` is pinned explicitly (not left to the adapter's default) so the blog repo's domain models — typed `id: number` throughout, matching WordPress's numeric ID convention — never break if a future Payload version changes its default ID type. A regression test (`tests/int/idType.int.spec.ts`) fails loudly if this ever changes.

`push: false` is set in every environment, including local dev. Schema changes only ever happen through committed, reviewed migration files — see `docs/database-and-migrations.md`.

## Admin UI import map

`src/app/(payload)/admin/importMap.js` is a **generated file** listing every client component the Admin UI needs (from Payload core, plus every plugin/feature in use). It is not regenerated automatically — run `pnpm payload generate:importmap` any time a plugin or custom component that registers Admin UI pieces is added, changed, or removed, and commit the result. Forgetting this produces `getFromImportMap: PayloadComponent not found in importMap` at runtime and breaks the Admin UI (see `docs/incidents.md`).
