import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Tenants } from './collections/Tenants'
import { Authors } from './collections/Authors'
import { Categories } from './collections/Categories'
import { Tags } from './collections/Tags'
import { Posts } from './collections/Posts'
import { Pages } from './collections/Pages'
import { Comments } from './collections/Comments'
import { vercelBlobStorage } from '@payloadcms/storage-vercel-blob'
import { multiTenantPlugin } from '@payloadcms/plugin-multi-tenant'
import { seoPlugin } from '@payloadcms/plugin-seo'
import type { Config } from './payload-types'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Media, Tenants, Authors, Categories, Tags, Posts, Pages, Comments],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    // Plain node-postgres (pg) over a standard TCP connection, not
    // @payloadcms/db-vercel-postgres's WebSocket-based Neon driver — that
    // adapter depends on @vercel/postgres, which Vercel has stopped
    // maintaining in favor of direct Neon integration, and it produced a
    // recurring `wss://localhost/v2` / ECONNREFUSED connection failure both
    // during Vercel's build step and intermittently at runtime (the same
    // adapter code never failed once locally — this is specific to Vercel's
    // serverless environment). This app runs as ordinary Node.js serverless
    // functions (not Edge), which support plain TCP fine — there's no need
    // for a WebSocket-based driver here at all.
    //
    // Pinned explicitly rather than relying on the implicit default — the blog's
    // domain models (Post.id, Author.id, etc.) are typed as `number`, matching
    // WordPress's numeric ID convention, to avoid a type-signature ripple across
    // src/domain, src/application, and src/app when the persistence layer swaps
    // from WordPress to Payload. If a future Payload version changes its default
    // id type, this stays serial regardless.
    idType: 'serial',
    // Migrations-only, in every environment (including local dev) — Payload's
    // docs warn against mixing dev-mode push with migrations on the same
    // project. Forcing this off everywhere means schema changes only ever
    // happen through committed, reviewed migration files (`payload
    // migrate:create`), never silently via whichever connection string
    // happens to be in scope when a command runs.
    push: false,
    pool: {
      // Vercel's Neon-Managed Integration provisions DATABASE_URL /
      // DATABASE_URL_UNPOOLED, not POSTGRES_URL — the latter was a
      // leftover from the with-vercel-postgres scaffold template's
      // now-defunct "Vercel Postgres" naming convention. The old
      // @vercel/postgres-based adapter has its own internal env
      // auto-detection that happened to find DATABASE_URL regardless of
      // what was passed here, masking this mismatch; plain pg.Pool uses
      // exactly what's passed, so it silently fell back to localhost.
      connectionString: process.env.DATABASE_URL || '',
    },
  }),
  plugins: [
    vercelBlobStorage({
      collections: {
        media: true,
      },
      token: process.env.BLOB_READ_WRITE_TOKEN || '',
    }),
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
      tenantsArrayField: {
        includeDefaultField: true,
      },
      userHasAccessToAllTenants: (user) => Boolean(user?.roles?.includes('admin')),
    }),
    seoPlugin({
      collections: ['posts', 'pages'],
      uploadsCollection: 'media',
      tabbedUI: true,
    }),
  ],
})
