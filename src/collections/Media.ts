import type { CollectionConfig } from 'payload'
import { staffOnly } from '../access/roles'
import { publicRead } from '../access/publicRead'
import { enforceTenantAssignment } from '../hooks/enforceTenantAssignment'

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: publicRead,
    create: staffOnly,
    update: staffOnly,
    delete: staffOnly,
  },
  hooks: {
    beforeChange: [enforceTenantAssignment],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
    {
      // Provider-agnostic id for the externally hosted asset — currently the
      // Cloudinary `public_id`. Written only by the storage adapter's internal
      // `payload.update` (Local API, access overridden); locked against
      // create/update from the public API so a client can't repoint a media row
      // at another asset.
      name: 'hostingId',
      type: 'text',
      access: {
        create: () => false,
        update: () => false,
      },
      admin: {
        hidden: true,
        readOnly: true,
      },
    },
  ],
  upload: {
    // Defense in depth: the storage adapter already serves SVG with
    // `script-src 'none'` and unknown types as octet-stream + nosniff, but
    // there's no reason to accept arbitrary file types in the first place.
    mimeTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/avif',
      'image/gif',
      'image/svg+xml',
      'application/pdf',
      'video/mp4',
      'video/webm',
    ],
  },
}
