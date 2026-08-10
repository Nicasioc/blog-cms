import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { describe, it, beforeAll, expect } from 'vitest'
import { lexicalContent } from '../helpers/lexicalContent'
import { seedTenant } from '../helpers/seedTenant'

let payload: Payload
let authorId: number
let tenantId: number

describe('Posts', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
    tenantId = await seedTenant(payload)

    const author = await payload.create({
      collection: 'authors',
      data: { name: 'Post Test Author', slug: 'post-test-author', tenant: tenantId },
    })
    authorId = author.id
  })

  it('creates a draft post and reads it back', async () => {
    const post = await payload.create({
      collection: 'posts',
      draft: true,
      data: {
        title: 'A Draft Post',
        slug: 'a-draft-post',
        content: lexicalContent('Draft body copy.'),
        author: authorId,
        tenant: tenantId,
        _status: 'draft',
      },
    })

    const found = await payload.findByID({
      collection: 'posts',
      id: post.id,
      draft: true,
    })

    expect(found.title).toBe('A Draft Post')
    expect(found._status).toBe('draft')
  })

  it('publishes a post with categories and tags', async () => {
    const category = await payload.create({
      collection: 'categories',
      data: { name: 'Post Test Category', slug: 'post-test-category', tenant: tenantId },
    })
    const tag = await payload.create({
      collection: 'tags',
      data: { name: 'Post Test Tag', slug: 'post-test-tag', tenant: tenantId },
    })

    const post = await payload.create({
      collection: 'posts',
      data: {
        title: 'A Published Post',
        slug: 'a-published-post',
        excerpt: 'A short summary.',
        content: lexicalContent('Published body copy.'),
        author: authorId,
        categories: [category.id],
        tags: [tag.id],
        publishedAt: new Date().toISOString(),
        tenant: tenantId,
        _status: 'published',
      },
    })

    const found = await payload.findByID({ collection: 'posts', id: post.id, depth: 0 })

    expect(found._status).toBe('published')
    expect(found.categories).toEqual([category.id])
    expect(found.tags).toEqual([tag.id])
  })

  it('rejects a duplicate slug', async () => {
    await payload.create({
      collection: 'posts',
      data: {
        title: 'First',
        slug: 'duplicate-post-slug',
        content: lexicalContent('First.'),
        author: authorId,
        tenant: tenantId,
        _status: 'published',
      },
    })

    await expect(
      payload.create({
        collection: 'posts',
        data: {
          title: 'Second',
          slug: 'duplicate-post-slug',
          content: lexicalContent('Second.'),
          author: authorId,
          tenant: tenantId,
          _status: 'published',
        },
      }),
    ).rejects.toThrow()
  })
})
