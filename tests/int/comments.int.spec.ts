import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { randomUUID } from 'crypto'
import { describe, it, beforeAll, expect } from 'vitest'
import { lexicalContent } from '../helpers/lexicalContent'
import { seedTenant } from '../helpers/seedTenant'

let payload: Payload
let postId: number
let tenantId: number

describe('Comments', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
    tenantId = await seedTenant(payload)

    const author = await payload.create({
      collection: 'authors',
      data: { name: 'Comment Test Author', slug: 'comment-test-author', tenant: tenantId },
    })
    const post = await payload.create({
      collection: 'posts',
      data: {
        title: 'Comment Test Post',
        slug: 'comment-test-post',
        content: lexicalContent('Body.'),
        author: author.id,
        tenant: tenantId,
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
        tenant: tenantId,
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
        tenant: tenantId,
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
        tenant: tenantId,
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
          tenant: tenantId,
        },
      }),
    ).rejects.toThrow()
  })

  it('derives tenant from the post, ignoring a client-supplied tenant on an anonymous create', async () => {
    const otherTenantId = await seedTenant(payload)

    const comment = await payload.create({
      collection: 'comments',
      draft: false,
      overrideAccess: false,
      data: {
        post: postId,
        authorName: 'Sneaky Reader',
        authorEmail: 'sneaky@example.com',
        content: 'Trying to file this under another tenant.',
        tenant: otherTenantId,
      },
    })

    expect(comment.tenant).toBe(tenantId)
  })
  describe('service and staff reads (BLO-200)', () => {
    const seedUser = async (roles: ('editor' | 'service')[]) => {
      const user = await payload.create({
        collection: 'users',
        data: {
          email: `comments-${roles[0]}-${randomUUID()}@example.com`,
          password: 'test-password-123',
          roles,
          tenants: [{ tenant: tenantId }],
        },
      })
      return { ...user, collection: 'users' as const }
    }

    const seedComment = (content: string) =>
      payload.create({
        collection: 'comments',
        data: {
          post: postId,
          authorName: 'Reader',
          authorEmail: 'private-reader@example.com',
          content,
          tenant: tenantId,
        },
      })

    it('hides pending comments and authorEmail from a service user', async () => {
      const service = await seedUser(['service'])
      const pending = await seedComment('service-pending')
      const approved = await seedComment('service-approved')
      await payload.update({
        collection: 'comments',
        id: approved.id,
        data: { status: 'approved' },
      })

      const result = await payload.find({
        collection: 'comments',
        overrideAccess: false,
        user: service,
        where: { post: { equals: postId } },
      })

      expect(result.docs.map((doc) => doc.id)).toContain(approved.id)
      expect(result.docs.map((doc) => doc.id)).not.toContain(pending.id)
      expect(result.docs.every((doc) => doc.authorEmail === undefined)).toBe(true)
    })

    it('shows pending comments and authorEmail to an editor', async () => {
      const editor = await seedUser(['editor'])
      const pending = await seedComment('editor-pending')

      const result = await payload.findByID({
        collection: 'comments',
        id: pending.id,
        overrideAccess: false,
        user: editor,
      })

      expect(result.authorEmail).toBe('private-reader@example.com')
    })

    it('rejects a service user updating or deleting a comment', async () => {
      const service = await seedUser(['service'])
      const comment = await seedComment('service-cannot-moderate')

      await expect(
        payload.update({
          collection: 'comments',
          id: comment.id,
          overrideAccess: false,
          user: service,
          data: { status: 'approved' },
        }),
      ).rejects.toThrow()
      await expect(
        payload.delete({
          collection: 'comments',
          id: comment.id,
          overrideAccess: false,
          user: service,
        }),
      ).rejects.toThrow()
    })
  })
})
