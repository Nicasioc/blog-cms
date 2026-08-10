import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { describe, it, beforeAll, expect } from 'vitest'

let payload: Payload

describe('Categories', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
  })

  it('creates and reads back a category', async () => {
    const category = await payload.create({
      collection: 'categories',
      data: { name: 'Politics', slug: 'politics', description: 'Political coverage.' },
    })

    const found = await payload.findByID({ collection: 'categories', id: category.id })

    expect(found.name).toBe('Politics')
    expect(found.slug).toBe('politics')
  })
})

describe('Tags', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
  })

  it('creates and reads back a tag', async () => {
    const tag = await payload.create({
      collection: 'tags',
      data: { name: 'Elections', slug: 'elections', description: 'Election coverage.' },
    })

    const found = await payload.findByID({ collection: 'tags', id: tag.id })

    expect(found.name).toBe('Elections')
    expect(found.slug).toBe('elections')
  })
})
