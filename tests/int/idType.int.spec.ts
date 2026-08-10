import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { describe, it, beforeAll, expect } from 'vitest'

let payload: Payload

/**
 * Regression test for the idType: 'serial' pin in payload.config.ts. The blog's
 * domain models (Post.id, Author.id, etc.) are typed as `number` — if a future
 * Payload/adapter upgrade ever changes the effective id type, this should fail
 * loudly here instead of silently breaking the blog's persistence layer.
 */
describe('id type', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
  })

  it('generates numeric (serial) ids, not UUIDs', async () => {
    const category = await payload.create({
      collection: 'categories',
      data: { name: 'ID Type Test', slug: 'id-type-test' },
    })

    expect(typeof category.id).toBe('number')
    expect(Number.isInteger(category.id)).toBe(true)
  })
})
