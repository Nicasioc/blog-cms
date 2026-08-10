import type { CollectionConfig } from 'payload'

export const Comments: CollectionConfig = {
  slug: 'comments',
  admin: {
    useAsTitle: 'authorName',
    defaultColumns: ['authorName', 'post', 'status', 'createdAt'],
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
      // Not required: this is system-controlled (defaulted here, enforced by a
      // beforeChange hook once public comment submission is wired up) — a caller
      // creating a comment should never need to supply this themselves.
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
