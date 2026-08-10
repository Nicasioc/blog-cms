import { vercelPostgresAdapter } from '@payloadcms/db-vercel-postgres'
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
  db: vercelPostgresAdapter({
    // Pinned explicitly rather than relying on the implicit default — the blog's
    // domain models (Post.id, Author.id, etc.) are typed as `number`, matching
    // WordPress's numeric ID convention, to avoid a type-signature ripple across
    // src/domain, src/application, and src/app when the persistence layer swaps
    // from WordPress to Payload. If a future Payload version changes its default
    // id type, this stays serial regardless.
    idType: 'serial',
    pool: {
      connectionString: process.env.POSTGRES_URL || '',
    },
  }),
  plugins: [
    vercelBlobStorage({
      collections: {
        media: true,
      },
      token: process.env.BLOB_READ_WRITE_TOKEN || '',
    }),
  ],
})
