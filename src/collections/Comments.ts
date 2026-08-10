import type { CollectionConfig } from 'payload'
import { approvedOrLoggedIn } from '../access/approvedOrLoggedIn'
import { publicRead } from '../access/publicRead'
import { forcePendingOnCreate } from '../hooks/forcePendingOnCreate'
import { enforceTenantAssignment } from '../hooks/enforceTenantAssignment'
import { revalidateOnCommentApproval } from '../hooks/revalidateOnCommentApproval'

export const Comments: CollectionConfig = {
  slug: 'comments',
  admin: {
    useAsTitle: 'authorName',
    defaultColumns: ['authorName', 'post', 'status', 'createdAt'],
  },
  access: {
    read: approvedOrLoggedIn,
    create: publicRead,
  },
  hooks: {
    // enforceTenantAssignment no-ops for anonymous submissions (no req.user) —
    // it only restricts authenticated non-admin users from assigning a tenant
    // other than their own.
    beforeChange: [forcePendingOnCreate, enforceTenantAssignment],
    afterChange: [revalidateOnCommentApproval],
  },
  fields: [
    {
      name: 'post',
      type: 'relationship',
      relationTo: 'posts',
      required: true,
    },
    {
      name: 'parent',
      type: 'relationship',
      relationTo: 'comments',
    },
    {
      name: 'authorName',
      type: 'text',
      required: true,
    },
    {
      name: 'authorEmail',
      type: 'email',
      required: true,
      access: {
        read: ({ req: { user } }) => Boolean(user),
      },
      admin: {
        description: 'Not exposed on public reads.',
      },
    },
    {
      name: 'authorUrl',
      type: 'text',
    },
    {
      name: 'content',
      type: 'textarea',
      required: true,
    },
    {
      // Not required: this is system-controlled (defaulted here, enforced by
      // forcePendingOnCreate regardless of what a public submitter sends) — a
      // caller creating a comment should never need to supply this themselves.
      name: 'status',
      type: 'select',
      defaultValue: 'pending',
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Approved', value: 'approved' },
        { label: 'Spam', value: 'spam' },
      ],
    },
  ],
}
