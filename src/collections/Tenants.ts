import type { CollectionConfig } from 'payload'
import { staffOnly } from '../access/roles'

export const Tenants: CollectionConfig = {
  slug: 'tenants',
  access: {
    create: staffOnly,
    update: staffOnly,
    delete: staffOnly,
  },
  admin: {
    useAsTitle: 'name',
  },
  fields: [
    {
      name: 'name',
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
      name: 'blogUrl',
      type: 'text',
      required: true,
      admin: {
        description: "This tenant's deployed blog URL, e.g. https://debate-cuervo.example.com",
      },
    },
    {
      name: 'revalidateSecret',
      type: 'text',
      required: true,
      admin: {
        description:
          "Must match this tenant's REVALIDATE_SECRET env var — used to authenticate the ISR revalidation webhook call.",
      },
    },
  ],
}
