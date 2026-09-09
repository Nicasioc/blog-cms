import type { CollectionConfig } from 'payload'
import { publicRead } from '../access/publicRead'
import { enforceTenantAssignment } from '../hooks/enforceTenantAssignment'
import { slugField } from '../fields/slugField'

export const Tags: CollectionConfig = {
  slug: 'tags',
  admin: {
    useAsTitle: 'name',
  },
  access: {
    read: publicRead,
  },
  hooks: {
    beforeChange: [enforceTenantAssignment],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    slugField,
    {
      name: 'description',
      type: 'textarea',
    },
  ],
}
