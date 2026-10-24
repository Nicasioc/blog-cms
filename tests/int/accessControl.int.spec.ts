import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { randomUUID } from 'crypto'
import { describe, it, beforeAll, expect } from 'vitest'
import { Users } from '@/collections/Users'
import type { User } from '@/payload-types'
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
  describe('user privilege escalation (BLO-199)', () => {
    const createUser = (
      email: string,
      roles: ('admin' | 'editor' | 'service')[],
      tenantId: number,
    ) =>
      payload.create({
        collection: 'users',
        data: { email, password: 'test-password-123', roles, tenants: [{ tenant: tenantId }] },
      })

    const asUser = <T extends object>(user: T) => ({ ...user, collection: 'users' as const })

    it("ignores an editor setting their own roles to ['admin']", async () => {
      const editor = await createUser(
        `esc-roles-${randomUUID()}@example.com`,
        ['editor'],
        tenantAId,
      )

      await payload.update({
        collection: 'users',
        id: editor.id,
        overrideAccess: false,
        user: asUser(editor),
        data: { roles: ['admin'] },
      })

      const after = await payload.findByID({ collection: 'users', id: editor.id })
      expect(after.roles).toEqual(['editor'])
    })

    it('ignores an editor adding a tenant to their own tenants array', async () => {
      const editor = await createUser(
        `esc-tenants-${randomUUID()}@example.com`,
        ['editor'],
        tenantAId,
      )

      await payload.update({
        collection: 'users',
        id: editor.id,
        overrideAccess: false,
        user: asUser(editor),
        data: { tenants: [{ tenant: tenantAId }, { tenant: tenantBId }] },
      })

      const after = await payload.findByID({ collection: 'users', id: editor.id, depth: 0 })
      expect(after.tenants?.map((row) => row.tenant)).toEqual([tenantAId])
    })

    it('lets an editor change their own password but not another users', async () => {
      const editor = await createUser(`own-pass-${randomUUID()}@example.com`, ['editor'], tenantAId)
      const peer = await createUser(`peer-${randomUUID()}@example.com`, ['editor'], tenantAId)

      await expect(
        payload.update({
          collection: 'users',
          id: editor.id,
          overrideAccess: false,
          user: asUser(editor),
          data: { password: 'a-new-password-456' },
        }),
      ).resolves.toBeTruthy()

      await expect(
        payload.update({
          collection: 'users',
          id: peer.id,
          overrideAccess: false,
          user: asUser(editor),
          data: { password: 'hijacked-password-789' },
        }),
      ).rejects.toThrow()
    })

    it('lets an admin change roles and tenants', async () => {
      const admin = await createUser(`admin-${randomUUID()}@example.com`, ['admin'], tenantAId)
      const target = await createUser(`target-${randomUUID()}@example.com`, ['editor'], tenantAId)

      await payload.update({
        collection: 'users',
        id: target.id,
        overrideAccess: false,
        user: asUser(admin),
        data: { roles: ['editor', 'service'], tenants: [{ tenant: tenantBId }] },
      })

      const after = await payload.findByID({ collection: 'users', id: target.id, depth: 0 })
      expect(after.roles).toEqual(['editor', 'service'])
      expect(after.tenants?.map((row) => row.tenant)).toEqual([tenantBId])
    })

    it('rejects user create and delete for non-admins', async () => {
      const editor = await createUser(
        `no-create-${randomUUID()}@example.com`,
        ['editor'],
        tenantAId,
      )
      const victim = await createUser(`victim-${randomUUID()}@example.com`, ['editor'], tenantAId)

      await expect(
        payload.create({
          collection: 'users',
          overrideAccess: false,
          user: asUser(editor),
          data: {
            email: `new-${randomUUID()}@example.com`,
            password: 'test-password-123',
            roles: ['editor'],
          },
        }),
      ).rejects.toThrow()
      await expect(
        payload.delete({
          collection: 'users',
          id: victim.id,
          overrideAccess: false,
          user: asUser(editor),
        }),
      ).rejects.toThrow()
    })
  })

  describe('service role (BLO-200)', () => {
    let service: User
    let serviceUser: object

    beforeAll(async () => {
      service = await payload.create({
        collection: 'users',
        data: {
          email: `service-${randomUUID()}@example.com`,
          password: 'test-password-123',
          roles: ['service'],
          tenants: [{ tenant: tenantAId }],
        },
      })
      serviceUser = { ...service, collection: 'users' }
    })

    it('cannot create, update or delete content', async () => {
      const category = await payload.create({
        collection: 'categories',
        data: { name: 'Service Target', slug: 'service-target', tenant: tenantAId },
      })

      await expect(
        payload.create({
          collection: 'categories',
          overrideAccess: false,
          user: serviceUser as never,
          data: { name: 'Nope', slug: 'service-nope', tenant: tenantAId },
        }),
      ).rejects.toThrow()
      await expect(
        payload.update({
          collection: 'categories',
          id: category.id,
          overrideAccess: false,
          user: serviceUser as never,
          data: { name: 'Changed' },
        }),
      ).rejects.toThrow()
      await expect(
        payload.delete({
          collection: 'categories',
          id: category.id,
          overrideAccess: false,
          user: serviceUser as never,
        }),
      ).rejects.toThrow()
    })

    it("reads its own tenant but not another tenant's", async () => {
      const own = await payload.find({
        collection: 'tenants',
        overrideAccess: false,
        user: serviceUser as never,
        where: { id: { equals: tenantAId } },
      })
      const other = await payload.find({
        collection: 'tenants',
        overrideAccess: false,
        user: serviceUser as never,
        where: { id: { equals: tenantBId } },
      })

      expect(own.docs).toHaveLength(1)
      expect(other.docs).toHaveLength(0)
    })

    it('does not see draft posts', async () => {
      await payload.create({
        collection: 'posts',
        draft: true,
        data: {
          title: 'Service Draft',
          slug: 'service-draft-post',
          content: lexicalContent('Draft.'),
          author: authorId,
          tenant: tenantAId,
          _status: 'draft',
        },
      })

      const result = await payload.find({
        collection: 'posts',
        overrideAccess: false,
        user: serviceUser as never,
        where: { slug: { equals: 'service-draft-post' } },
      })

      expect(result.docs).toHaveLength(0)
    })

    it('cannot log into the admin UI', () => {
      const adminAccess = Users.access?.admin
      expect(adminAccess).toBeDefined()
      expect(adminAccess!({ req: { user: service } } as never)).toBe(false)
    })
  })
})
