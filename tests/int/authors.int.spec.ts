import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { describe, it, beforeAll, expect } from 'vitest'

let payload: Payload

describe('Authors', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
  })

  it('creates and reads back an author', async () => {
    const author = await payload.create({
      collection: 'authors',
      data: {
        name: 'Jane Doe',
        slug: 'jane-doe',
        description: 'Staff writer.',
      },
    })

    const found = await payload.findByID({
      collection: 'authors',
      id: author.id,
    })

    expect(found.name).toBe('Jane Doe')
    expect(found.slug).toBe('jane-doe')
  })

  it('rejects a duplicate slug', async () => {
    await payload.create({
      collection: 'authors',
      data: { name: 'First Author', slug: 'duplicate-author-slug' },
    })

    await expect(
      payload.create({
        collection: 'authors',
        data: { name: 'Second Author', slug: 'duplicate-author-slug' },
      }),
    ).rejects.toThrow()
  })
})
