import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { describe, it, beforeAll, expect } from 'vitest'
import { lexicalContent } from '../helpers/lexicalContent'
import { seedTenant } from '../helpers/seedTenant'

let payload: Payload
let tenantAId: number
let tenantBId: number
let authorId: number

describe('Access control', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
    tenantAId = await seedTenant(payload)
    tenantBId = await seedTenant(payload)

    const author = await payload.create({
      collection: 'authors',
      data: { name: 'Access Test Author', slug: 'access-test-author', tenant: tenantAId },
    })
    authorId = author.id
  })

  describe('public read', () => {
    it('only returns published posts to anonymous requests', async () => {
      await payload.create({
        collection: 'posts',
        draft: true,
        data: {
          title: 'A Draft',
          slug: 'access-draft-post',
          content: lexicalContent('Draft.'),
          author: authorId,
          tenant: tenantAId,
          _status: 'draft',
        },
      })
      await payload.create({
        collection: 'posts',
        data: {
          title: 'A Published Post',
          slug: 'access-published-post',
          content: lexicalContent('Published.'),
          author: authorId,
          tenant: tenantAId,
          _status: 'published',
        },
      })

      const anonymous = await payload.find({
        collection: 'posts',
        overrideAccess: false,
        where: { slug: { in: ['access-draft-post', 'access-published-post'] } },
      })

      expect(anonymous.docs.map((doc) => doc.slug)).toEqual(['access-published-post'])
    })

    it('only returns approved comments to anonymous requests', async () => {
      const post = await payload.create({
        collection: 'posts',
        data: {
          title: 'Comment Access Post',
          slug: 'comment-access-post',
          content: lexicalContent('Body.'),
          author: authorId,
          tenant: tenantAId,
          _status: 'published',
        },
      })
      await payload.create({
        collection: 'comments',
        overrideAccess: false,
        data: {
          post: post.id,
          authorName: 'Reader',
          authorEmail: 'reader@example.com',
          content: 'Pending by default.',
          tenant: tenantAId,
        },
      })
      await payload.update({
        collection: 'comments',
        where: { post: { equals: post.id } },
        data: { status: 'approved' },
      })
      await payload.create({
        collection: 'comments',
        overrideAccess: false,
        data: {
          post: post.id,
          authorName: 'Reader Two',
          authorEmail: 'reader-two@example.com',
          content: 'Still pending.',
          tenant: tenantAId,
        },
      })

      const anonymous = await payload.find({
        collection: 'comments',
        overrideAccess: false,
        where: { post: { equals: post.id } },
      })

      expect(anonymous.docs).toHaveLength(1)
      expect(anonymous.docs[0].status).toBe('approved')
    })
  })

  describe('write requires auth', () => {
    it('rejects an anonymous category create', async () => {
      await expect(
        payload.create({
          collection: 'categories',
          overrideAccess: false,
          data: { name: 'Should Fail', slug: 'access-should-fail', tenant: tenantAId },
        }),
      ).rejects.toThrow()
    })

    it('allows anonymous comment creation but forces status to pending', async () => {
      const post = await payload.create({
        collection: 'posts',
        data: {
          title: 'Force Pending Post',
          slug: 'force-pending-post',
          content: lexicalContent('Body.'),
          author: authorId,
          tenant: tenantAId,
          _status: 'published',
        },
      })

      const comment = await payload.create({
        collection: 'comments',
        overrideAccess: false,
        data: {
          post: post.id,
          authorName: 'Sneaky Reader',
          authorEmail: 'sneaky@example.com',
          content: 'Trying to self-approve.',
          tenant: tenantAId,
          // Deliberately submitting a disallowed status to prove the hook overrides it.
          status: 'approved',
        },
      })

      expect(comment.status).toBe('pending')
    })
  })

  describe('tenant isolation', () => {
    it("a tenant-scoped user cannot read another tenant's categories", async () => {
      const categoryA = await payload.create({
        collection: 'categories',
        data: { name: 'Tenant A Category', slug: 'tenant-a-category', tenant: tenantAId },
      })
      await payload.create({
        collection: 'categories',
        data: { name: 'Tenant B Category', slug: 'tenant-b-category', tenant: tenantBId },
      })

      const userA = await payload.create({
        collection: 'users',
        data: {
          email: 'tenant-a-user@example.com',
          password: 'test-password-123',
          roles: ['editor'],
          tenants: [{ tenant: tenantAId }],
        },
      })

      const results = await payload.find({
        collection: 'categories',
        overrideAccess: false,
        user: { ...userA, collection: 'users' },
        where: { slug: { in: ['tenant-a-category', 'tenant-b-category'] } },
      })

      expect(results.docs.map((doc) => doc.id)).toEqual([categoryA.id])
    })

    it("rejects assigning another tenant's ID on create", async () => {
      const userA = await payload.create({
        collection: 'users',
        data: {
          email: 'tenant-a-user-2@example.com',
          password: 'test-password-123',
          roles: ['editor'],
          tenants: [{ tenant: tenantAId }],
        },
      })

      await expect(
        payload.create({
          collection: 'categories',
          overrideAccess: false,
          user: { ...userA, collection: 'users' },
          data: { name: 'Cross Tenant', slug: 'cross-tenant-category', tenant: tenantBId },
        }),
      ).rejects.toThrow()
    })
  })
})
