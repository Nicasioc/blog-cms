import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { describe, it, beforeAll, expect, vi } from 'vitest'

// Force the Cloudinary storage plugin ON for this spec regardless of what a
// local .env holds (vitest.setup.ts loads dotenv), and stub the SDK so nothing
// leaves the process. Runs before the hoisted `import config` below.
vi.hoisted(() => {
  process.env.CLOUDINARY_CLOUD_NAME ??= 'test-cloud'
  process.env.CLOUDINARY_API_KEY ??= 'test-key'
  process.env.CLOUDINARY_API_SECRET ??= 'test-secret'
})

vi.mock('cloudinary', () => ({
  v2: {
    config: vi.fn(),
    url: (publicId: string, opts: { format?: string } = {}) =>
      `https://res.cloudinary.com/test-cloud/image/upload/${publicId}${
        opts.format ? `.${opts.format}` : ''
      }`,
    uploader: {
      upload_stream: (opts: { public_id: string }, cb: (err: unknown, res: unknown) => void) => ({
        end: () =>
          cb(null, {
            bytes: 70,
            format: 'png',
            public_id: opts.public_id,
            resource_type: 'image',
          }),
      }),
      destroy: vi.fn().mockResolvedValue({ result: 'ok' }),
    },
  },
}))

import { getPayload, Payload } from 'payload'
import { v2 as cloudinary } from 'cloudinary'
import config from '@/payload.config'
import {
  contentTypeForExt,
  extractId,
  resourceTypeForExt,
  splitExtension,
  uploadPublicId,
} from '@/storage/cloudinaryAdapter'
import { seedTenant } from '../helpers/seedTenant'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const pixel = readFileSync(path.resolve(dirname, '../fixtures/pixel.png'))

describe('cloudinaryAdapter pure helpers', () => {
  it('splits extensions', () => {
    expect(splitExtension('photo.final.jpg')).toEqual({ ext: 'jpg', name: 'photo.final' })
    expect(splitExtension('noext')).toEqual({ ext: '', name: 'noext' })
  })

  it('extracts a relationship id from an id or a populated doc', () => {
    expect(extractId(3)).toBe(3)
    expect(extractId({ id: 3 })).toBe(3)
    expect(extractId(null)).toBeUndefined()
  })

  it('builds a per-tenant public_id and falls back without a tenant', () => {
    expect(uploadPublicId('media', 3, 'a b.png')).toBe('media/3/a b')
    expect(uploadPublicId('media', undefined, 'hero.png')).toBe('media/hero')
  })

  it('maps extensions to a Cloudinary resource type and a content type', () => {
    expect(resourceTypeForExt('png')).toBe('image')
    expect(resourceTypeForExt('mp4')).toBe('video')
    expect(resourceTypeForExt('pdf')).toBe('raw')
    expect(resourceTypeForExt('zip')).toBe('raw')
    expect(contentTypeForExt('svg')).toBe('image/svg+xml')
    expect(contentTypeForExt('png')).toBeUndefined()
  })
})

describe('Media collection', () => {
  let payload: Payload
  let tenantAId: number
  let tenantBId: number

  const createMedia = (opts: {
    alt: string
    overrideAccess?: boolean
    tenant: number
    user?: unknown
  }) =>
    payload.create({
      collection: 'media',
      data: { alt: opts.alt, tenant: opts.tenant },
      file: { data: pixel, mimetype: 'image/png', name: `${opts.alt}.png`, size: pixel.length },
      overrideAccess: opts.overrideAccess,
      user: opts.user as never,
    })

  const seedEditor = async (tenantId: number) => {
    const user = await payload.create({
      collection: 'users',
      data: {
        email: `media-editor-${Date.now()}-${Math.random()}@example.com`,
        password: 'test-password-123',
        roles: ['editor'],
        tenants: [{ tenant: tenantId }],
      },
    })
    return { ...user, collection: 'users' as const }
  }

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    tenantAId = await seedTenant(payload)
    tenantBId = await seedTenant(payload)
  })

  it('uploads through the Cloudinary adapter and stores the returned public_id', async () => {
    const doc = await createMedia({ alt: 'wiring-logo', tenant: tenantAId })

    expect(doc.filename).toBe('wiring-logo.png')
    expect(doc.hostingId).toBe(`media/${tenantAId}/wiring-logo`)
    // Access control is on, so the URL is the Payload proxy, not res.cloudinary.com
    expect(doc.url).toContain('/api/media/file/')
  })

  it('serves media to anonymous reads (publicRead)', async () => {
    await createMedia({ alt: 'public-asset', tenant: tenantAId })

    const anon = await payload.find({
      collection: 'media',
      overrideAccess: false,
      where: { alt: { equals: 'public-asset' } },
    })

    expect(anon.docs).toHaveLength(1)
  })

  it('rejects an anonymous media create', async () => {
    await expect(
      createMedia({ alt: 'nope', overrideAccess: false, tenant: tenantAId }),
    ).rejects.toThrow()
  })

  it('scopes reads and blocks cross-tenant writes for a tenant editor', async () => {
    const editorA = await seedEditor(tenantAId)
    const mediaA = await createMedia({ alt: 'iso-a', tenant: tenantAId })
    await createMedia({ alt: 'iso-b', tenant: tenantBId })

    const visible = await payload.find({
      collection: 'media',
      overrideAccess: false,
      user: editorA as never,
      where: { alt: { in: ['iso-a', 'iso-b'] } },
    })
    expect(visible.docs.map((d) => d.id)).toEqual([mediaA.id])

    await expect(
      createMedia({
        alt: 'cross-tenant',
        overrideAccess: false,
        tenant: tenantBId,
        user: editorA,
      }),
    ).rejects.toThrow()
  })

  it('ignores a client-supplied hostingId on update', async () => {
    const editorA = await seedEditor(tenantAId)
    const doc = await createMedia({ alt: 'locked-field', tenant: tenantAId })

    const updated = await payload.update({
      collection: 'media',
      id: doc.id,
      data: { alt: 'locked-field-renamed', hostingId: 'media/999/hacked' } as never,
      overrideAccess: false,
      user: editorA as never,
    })

    expect(updated.alt).toBe('locked-field-renamed')
    expect(updated.hostingId).toBe(`media/${tenantAId}/locked-field`)
  })

  it('deletes the Cloudinary asset when the doc is deleted', async () => {
    const doc = await createMedia({ alt: 'to-delete', tenant: tenantAId })
    vi.mocked(cloudinary.uploader.destroy).mockClear()

    await payload.delete({ collection: 'media', id: doc.id })

    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(
      `media/${tenantAId}/to-delete`,
      expect.objectContaining({ resource_type: 'image' }),
    )
  })
})
