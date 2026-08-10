import type { CollectionConfig } from 'payload'
import { publishedOrLoggedIn } from '../access/publishedOrLoggedIn'
import { enforceTenantAssignment } from '../hooks/enforceTenantAssignment'

export const Pages: CollectionConfig = {
  slug: 'pages',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', '_status'],
  },
  access: {
    read: publishedOrLoggedIn,
  },
  hooks: {
    beforeChange: [enforceTenantAssignment],
  },
  versions: {
    drafts: true,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'content',
      type: 'richText',
      required: true,
    },
  ],
}
