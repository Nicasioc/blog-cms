import type { CollectionConfig } from 'payload'
import { publicRead } from '../access/publicRead'
import { enforceTenantAssignment } from '../hooks/enforceTenantAssignment'

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: publicRead,
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
  upload: true,
}
