import type { Adapter, GeneratedAdapter } from '@payloadcms/plugin-cloud-storage/types'
import type { FileData, TypeWithID } from 'payload'
import { v2 as cloudinary } from 'cloudinary'

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

const VIDEO_EXT = new Set(['mp4', 'webm', 'mov', 'm4v', 'mkv', 'avi', 'ogv'])
// `pdf` delivered as an `image` resource so Cloudinary returns `application/pdf`
// rather than the `application/octet-stream` it uses for every `raw` asset.
const IMAGE_EXT = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'avif',
  'svg',
  'tiff',
  'tif',
  'bmp',
  'ico',
  'pdf',
])
const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  svg: 'image/svg+xml',
  zip: 'application/zip',
  txt: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
}

export type CloudinaryAdapterConfig = {
  cloudName: string
  apiKey: string
  apiSecret: string
  /** Top-level Cloudinary folder; the tenant id is appended under it. */
  folder: string
}

type MediaDoc = {
  tenant?: unknown
  hostingId?: null | string
}

/** `"a.b.jpg"` -> `{ name: "a.b", ext: "jpg" }`; extensionless -> `{ name, ext: "" }`. */
export const splitExtension = (filename: string): { ext: string; name: string } => {
  const dot = filename.lastIndexOf('.')
  if (dot <= 0) {
    return { ext: '', name: filename }
  }
  return { ext: filename.slice(dot + 1), name: filename.slice(0, dot) }
}

/** A relationship value is an id or a populated doc depending on the query depth. */
export const extractId = (rel: unknown): number | string | undefined => {
  if (rel === null || rel === undefined) {
    return undefined
  }
  if (typeof rel === 'object') {
    return (rel as { id?: number | string }).id
  }
  return rel as number | string
}

/**
 * The `public_id` GENERATED at upload time. Thereafter the value Cloudinary
 * echoes back is stored on the doc (`hostingId`) and is authoritative.
 */
export const uploadPublicId = (
  folder: string,
  tenantId: number | string | undefined,
  filename: string,
): string => {
  const { name } = splitExtension(filename)
  return [folder, tenantId, name]
    .filter((segment) => segment !== undefined && segment !== '')
    .join('/')
}

export const resourceTypeForExt = (ext: string): 'image' | 'raw' | 'video' => {
  const normalized = ext.toLowerCase()
  if (VIDEO_EXT.has(normalized)) {
    return 'video'
  }
  if (IMAGE_EXT.has(normalized)) {
    return 'image'
  }
  return 'raw'
}

export const contentTypeForExt = (ext: string): string | undefined => MIME_BY_EXT[ext.toLowerCase()]

const pickHeaders = (source: Headers, names: string[]): Headers => {
  const picked = new Headers()
  for (const name of names) {
    const value = source.get(name)
    if (value) {
      picked.set(name, value)
    }
  }
  return picked
}

export const createCloudinaryAdapter =
  ({ apiKey, apiSecret, cloudName, folder }: CloudinaryAdapterConfig): Adapter =>
  () => {
    cloudinary.config({
      api_key: apiKey,
      api_secret: apiSecret,
      cloud_name: cloudName,
      secure: true,
    })

    const deliveryURL = (publicId: string, ext: string): string =>
      cloudinary.url(publicId, { resource_type: resourceTypeForExt(ext), secure: true })

    const adapter: GeneratedAdapter = {
      name: 'cloudinary',

      // Runs from an afterChange hook with `data` = the persisted doc (tenant
      // populated). The returned object is merged into the doc by the plugin via
      // an internal, recursion-guarded payload.update — so we persist the
      // Cloudinary public_id and nothing else.
      handleUpload: async ({ data, file }) => {
        const tenantId = extractId((data as MediaDoc)?.tenant)
        const { ext } = splitExtension(file.filename)
        const result = await new Promise<{ public_id: string }>((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              invalidate: true,
              overwrite: true,
              public_id: uploadPublicId(folder, tenantId, file.filename),
              resource_type: resourceTypeForExt(ext),
              unique_filename: false,
              use_filename: false,
            },
            (error, uploaded) => {
              if (error || !uploaded) {
                reject(error ?? new Error('Cloudinary upload returned no result'))
                return
              }
              resolve(uploaded)
            },
          )
          stream.end(file.buffer)
        })

        return { hostingId: result.public_id } as Partial<FileData & TypeWithID>
      },

      handleDelete: async ({ doc, filename }) => {
        const media = doc as MediaDoc
        const { ext } = splitExtension(filename)
        const publicId =
          media?.hostingId ?? uploadPublicId(folder, extractId(media?.tenant), filename)
        await cloudinary.uploader.destroy(publicId, {
          invalidate: true,
          resource_type: resourceTypeForExt(ext),
        })
      },

      // Only consulted when disablePayloadAccessControl is true (we don't set it).
      // Kept correct for completeness.
      generateURL: ({ data, filename }) => {
        const media = data as MediaDoc
        const { ext } = splitExtension(filename)
        const publicId =
          media?.hostingId ?? uploadPublicId(folder, extractId(media?.tenant), filename)
        return deliveryURL(publicId, ext)
      },

      // Backs GET /api/media/file/:filename (admin thumbnails, REST, next/image).
      staticHandler: async (req, args) => {
        try {
          const { filename } = args.params
          let media = args.doc as MediaDoc | undefined
          if (!media) {
            const { docs } = await req.payload.find({
              collection: 'media',
              depth: 0,
              limit: 1,
              overrideAccess: true,
              pagination: false,
              req,
              where: { filename: { equals: filename } },
            })
            if (docs.length === 0) {
              return new Response(null, { status: 404 })
            }
            media = docs[0] as MediaDoc
          }

          const { ext } = splitExtension(filename)
          const publicId =
            media.hostingId ?? uploadPublicId(folder, extractId(media.tenant), filename)

          const range = req.headers.get('range')
          const ifNoneMatch = req.headers.get('if-none-match')
          const upstream = await fetch(deliveryURL(publicId, ext), {
            headers: {
              ...(range ? { Range: range } : {}),
              ...(ifNoneMatch ? { 'If-None-Match': ifNoneMatch } : {}),
            },
          })

          if (upstream.status === 304) {
            return new Response(null, {
              headers: pickHeaders(upstream.headers, ['etag', 'cache-control']),
              status: 304,
            })
          }
          if (!upstream.ok && upstream.status !== 206) {
            return new Response(null, { status: upstream.status === 404 ? 404 : 502 })
          }

          const headers = pickHeaders(upstream.headers, [
            'content-length',
            'content-range',
            'accept-ranges',
            'etag',
          ])
          const upstreamType = upstream.headers.get('content-type')
          const extType = contentTypeForExt(ext)
          const contentType =
            resourceTypeForExt(ext) === 'raw' ||
            !upstreamType ||
            upstreamType === 'application/octet-stream'
              ? (extType ?? upstreamType ?? 'application/octet-stream')
              : upstreamType
          headers.set('Content-Type', contentType)
          headers.set('Cache-Control', `public, max-age=${ONE_YEAR_SECONDS}`)
          if (contentType === 'image/svg+xml') {
            // user-uploaded SVG served same-origin under /api — block script execution
            headers.set('Content-Security-Policy', "script-src 'none'")
          } else if (resourceTypeForExt(ext) === 'raw') {
            headers.set('Content-Disposition', `inline; filename="${filename}"`)
          }
          return new Response(upstream.body, { headers, status: upstream.status })
        } catch (error) {
          req.payload.logger.error({ err: error, msg: 'cloudinary staticHandler failed' })
          return new Response('Internal Server Error', { status: 500 })
        }
      },
    }

    return adapter
  }
