import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { describe, it, beforeAll, expect } from 'vitest'
import { lexicalContent } from '../helpers/lexicalContent'

let payload: Payload
let authorId: number

describe('Posts', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })

    const author = await payload.create({
      collection: 'authors',
      data: { name: 'Post Test Author', slug: 'post-test-author' },
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
      data: { name: 'Post Test Category', slug: 'post-test-category' },
    })
    const tag = await payload.create({
      collection: 'tags',
      data: { name: 'Post Test Tag', slug: 'post-test-tag' },
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
        _status: 'published',
      },
    })

    const found = await payload.findByID({ collection: 'posts', id: post.id })

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
          _status: 'published',
        },
      }),
    ).rejects.toThrow()
  })
})
