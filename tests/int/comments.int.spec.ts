import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { describe, it, beforeAll, expect } from 'vitest'
import { lexicalContent } from '../helpers/lexicalContent'

let payload: Payload
let postId: number

describe('Comments', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })

    const author = await payload.create({
      collection: 'authors',
      data: { name: 'Comment Test Author', slug: 'comment-test-author' },
    })
    const post = await payload.create({
      collection: 'posts',
      data: {
        title: 'Comment Test Post',
        slug: 'comment-test-post',
        content: lexicalContent('Body.'),
        author: author.id,
        _status: 'published',
      },
    })
    postId = post.id
  })

  it('defaults status to pending', async () => {
    const comment = await payload.create({
      collection: 'comments',
      draft: false,
      data: {
        post: postId,
        authorName: 'Reader One',
        authorEmail: 'reader-one@example.com',
        content: 'Great article!',
      },
    })

    expect(comment.status).toBe('pending')
  })

  it('supports threaded replies via the parent relationship', async () => {
    const parent = await payload.create({
      collection: 'comments',
      draft: false,
      data: {
        post: postId,
        authorName: 'Reader Two',
        authorEmail: 'reader-two@example.com',
        content: 'Top-level comment.',
      },
    })

    const reply = await payload.create({
      collection: 'comments',
      draft: false,
      data: {
        post: postId,
        parent: parent.id,
        authorName: 'Reader Three',
        authorEmail: 'reader-three@example.com',
        content: 'A reply.',
      },
    })

    const found = await payload.findByID({ collection: 'comments', id: reply.id, depth: 0 })

    expect(found.parent).toBe(parent.id)
  })

  it('rejects an invalid email', async () => {
    await expect(
      payload.create({
        collection: 'comments',
        draft: false,
        data: {
          post: postId,
          authorName: 'Reader Four',
          authorEmail: 'not-an-email',
          content: 'Should fail.',
        },
      }),
    ).rejects.toThrow()
  })
})
