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
  ],
  upload: true,
}
