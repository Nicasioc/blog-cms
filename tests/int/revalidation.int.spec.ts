import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { describe, it, beforeAll, beforeEach, afterEach, expect, vi } from 'vitest'
import { lexicalContent } from '../helpers/lexicalContent'

let payload: Payload
let tenantId: number
let authorId: number
const blogUrl = 'https://revalidation-test.example.com'
const revalidateSecret = 'revalidation-test-secret-1234567890'

describe('Revalidation hooks', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })

    const tenant = await payload.create({
      collection: 'tenants',
      data: {
        name: 'Revalidation Test Tenant',
        slug: `revalidation-test-tenant-${Date.now()}`,
        blogUrl,
        revalidateSecret,
      },
    })
    tenantId = tenant.id

    const author = await payload.create({
      collection: 'authors',
      data: {
        name: 'Revalidation Test Author',
        slug: 'revalidation-test-author',
        tenant: tenantId,
      },
    })
    authorId = author.id
  })

  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fires the webhook when a post is published', async () => {
    await payload.create({
      collection: 'posts',
      data: {
        title: 'Published Revalidation Post',
        slug: 'published-revalidation-post',
        content: lexicalContent('Body.'),
        author: authorId,
        tenant: tenantId,
        _status: 'published',
      },
    })

    expect(fetchMock).toHaveBeenCalledWith(
      `${blogUrl}/api/revalidate?secret=${revalidateSecret}`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ slug: 'published-revalidation-post' }),
      }),
    )
  })

  it('does not fire the webhook when a post is saved as a draft', async () => {
    await payload.create({
      collection: 'posts',
      draft: true,
      data: {
        title: 'Draft Revalidation Post',
        slug: 'draft-revalidation-post',
        content: lexicalContent('Body.'),
        author: authorId,
        tenant: tenantId,
        _status: 'draft',
      },
    })

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('purges both slugs when a published post is renamed', async () => {
    const post = await payload.create({
      collection: 'posts',
      data: {
        title: 'Original Slug Post',
        slug: 'original-slug-post',
        content: lexicalContent('Body.'),
        author: authorId,
        tenant: tenantId,
        _status: 'published',
      },
    })
    fetchMock.mockClear()

    await payload.update({
      collection: 'posts',
      id: post.id,
      data: { slug: 'renamed-slug-post', _status: 'published' },
    })

    const calledSlugs = fetchMock.mock.calls.map(([, opts]) => JSON.parse(opts.body).slug)
    expect(calledSlugs.sort()).toEqual(['original-slug-post', 'renamed-slug-post'])
  })

  it('fires the webhook when a published post is deleted', async () => {
    const post = await payload.create({
      collection: 'posts',
      data: {
        title: 'Deleted Revalidation Post',
        slug: 'deleted-revalidation-post',
        content: lexicalContent('Body.'),
        author: authorId,
        tenant: tenantId,
        _status: 'published',
      },
    })
    fetchMock.mockClear()

    await payload.delete({ collection: 'posts', id: post.id })

    expect(fetchMock).toHaveBeenCalledWith(
      `${blogUrl}/api/revalidate?secret=${revalidateSecret}`,
      expect.objectContaining({ body: JSON.stringify({ slug: 'deleted-revalidation-post' }) }),
    )
  })

  it('fires the webhook with the post slug when a comment is approved, not on raw submission', async () => {
    const post = await payload.create({
      collection: 'posts',
      data: {
        title: 'Comment Revalidation Post',
        slug: 'comment-revalidation-post',
        content: lexicalContent('Body.'),
        author: authorId,
        tenant: tenantId,
        _status: 'published',
      },
    })
    fetchMock.mockClear()

    const comment = await payload.create({
      collection: 'comments',
      overrideAccess: false,
      data: {
        post: post.id,
        authorName: 'Revalidation Reader',
        authorEmail: 'revalidation-reader@example.com',
        content: 'Pending comment.',
        tenant: tenantId,
      },
    })

    expect(fetchMock).not.toHaveBeenCalled()

    await payload.update({
      collection: 'comments',
      id: comment.id,
      data: { status: 'approved' },
    })

    expect(fetchMock).toHaveBeenCalledWith(
      `${blogUrl}/api/revalidate?secret=${revalidateSecret}`,
      expect.objectContaining({ body: JSON.stringify({ slug: 'comment-revalidation-post' }) }),
    )
  })
})
