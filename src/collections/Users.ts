import type { CollectionConfig } from 'payload'
import { adminOnly, adminOnlyField, isAdmin, isService, isStaff } from '../access/roles'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
  },
  auth: {
    useAPIKey: true,
  },
  access: {
    // Admins edit anyone; editors only their own doc (never roles/tenants — see
    // the field access below); service users nothing.
    update: ({ req: { user } }) => {
      if (!user || isService(user)) return false
      if (isAdmin(user)) return true

      return { id: { equals: user.id } }
    },
    create: adminOnly,
    delete: adminOnly,
    // Admin UI login: staff only, so a service (API-key) user can't sign in.
    admin: ({ req: { user } }) => isStaff(user),
  },
  fields: [
    // Email added by default
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      required: true,
      defaultValue: ['editor'],
      // Without this, any editor could PATCH their own doc with roles: ['admin'].
      access: {
        create: adminOnlyField,
        update: adminOnlyField,
      },
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Editor', value: 'editor' },
        { label: 'Service', value: 'service' },
      ],
    },
  ],
  versions: false,
}
