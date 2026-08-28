import type { CollectionOptions } from '@payloadcms/plugin-cloud-storage/types'
import type { Plugin, UploadCollectionSlug } from 'payload'

import { cloudStoragePlugin } from '@payloadcms/plugin-cloud-storage'

import { createCloudinaryAdapter } from './cloudinaryAdapter'

export type CloudinaryStorageOptions = {
  apiKey: string | undefined
  apiSecret: string | undefined
  cloudName: string | undefined
  collections: Partial<Record<UploadCollectionSlug, true>>
  /** Top-level Cloudinary folder for each collection; defaults to the slug. */
  folder?: string
}

/**
 * Cloudinary storage, shaped like `@payloadcms/storage-vercel-blob`.
 *
 * With any credential missing the plugin is a no-op and Payload falls back to
 * local-disk storage — the same `!options.token` contract vercel-blob had. This
 * is what keeps `payload migrate` / `test:int` (CI) and `migrate-production.yml`
 * working with only `DATABASE_URL` + `PAYLOAD_SECRET` set.
 */
export const cloudinaryStorage =
  (options: CloudinaryStorageOptions): Plugin =>
  (incomingConfig) => {
    const { apiKey, apiSecret, cloudName, collections, folder } = options

    if (!cloudName || !apiKey || !apiSecret) {
      return incomingConfig
    }

    const collectionsWithAdapter: Partial<Record<string, CollectionOptions>> = Object.fromEntries(
      Object.keys(collections).map((slug) => [
        slug,
        {
          adapter: createCloudinaryAdapter({
            apiKey,
            apiSecret,
            cloudName,
            folder: folder ?? slug,
          }),
        },
      ]),
    )

    const config = {
      ...incomingConfig,
      collections: (incomingConfig.collections ?? []).map((collection) => {
        if (!collectionsWithAdapter[collection.slug]) {
          return collection
        }
        // `cloudStoragePlugin` already defaults this to true when an adapter is
        // present; set it explicitly so the collection config is self-describing
        // (mirrors vercel-blob).
        return {
          ...collection,
          upload: {
            ...(typeof collection.upload === 'object' ? collection.upload : {}),
            disableLocalStorage: true,
          },
        }
      }),
    }

    return cloudStoragePlugin({ collections: collectionsWithAdapter })(config)
  }
