import type { CollectionConfig } from 'payload'
import { lexicalHTMLField } from '@payloadcms/richtext-lexical'
import { publishedOrLoggedIn } from '../access/publishedOrLoggedIn'
import { enforceTenantAssignment } from '../hooks/enforceTenantAssignment'
import { revalidatePostOrPage, revalidatePostOrPageOnDelete } from '../hooks/revalidatePostOrPage'

export const Posts: CollectionConfig = {
  slug: 'posts',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', '_status', 'publishedAt', 'featured'],
  },
  access: {
    read: publishedOrLoggedIn,
  },
  hooks: {
    beforeChange: [enforceTenantAssignment],
    afterChange: [revalidatePostOrPage],
    afterDelete: [revalidatePostOrPageOnDelete],
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
      name: 'excerpt',
      type: 'textarea',
    },
    {
      name: 'content',
      type: 'richText',
      required: true,
    },
    lexicalHTMLField({ htmlFieldName: 'contentHtml', lexicalFieldName: 'content' }),
    {
      name: 'publishedAt',
      type: 'date',
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
    },
    {
      name: 'featured',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        position: 'sidebar',
        description: 'Show this post in the homepage hero carousel.',
      },
    },
    {
      name: 'featuredImage',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'authors',
      required: true,
    },
    {
      name: 'categories',
      type: 'relationship',
      relationTo: 'categories',
      hasMany: true,
    },
    {
      name: 'tags',
      type: 'relationship',
      relationTo: 'tags',
      hasMany: true,
    },
  ],
}
