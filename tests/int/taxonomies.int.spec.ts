import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { describe, it, beforeAll, expect } from 'vitest'
import { seedTenant } from '../helpers/seedTenant'

let payload: Payload
let tenantId: number

describe('Categories', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
    tenantId = await seedTenant(payload)
  })

  it('creates and reads back a category', async () => {
    const category = await payload.create({
      collection: 'categories',
      data: {
        name: 'Politics',
        slug: 'politics',
        description: 'Political coverage.',
        tenant: tenantId,
      },
    })

    const found = await payload.findByID({ collection: 'categories', id: category.id })

    expect(found.name).toBe('Politics')
    expect(found.slug).toBe('politics')
  })

  it('lowercases and trims the slug on create (BLO-160)', async () => {
    const category = await payload.create({
      collection: 'categories',
      data: {
        name: 'Institucionales',
        slug: '  Institucionales  ',
        tenant: tenantId,
      },
    })

    expect(category.slug).toBe('institucionales')
  })

  it('lowercases the slug on update', async () => {
    const category = await payload.create({
      collection: 'categories',
      data: { name: 'Mercado', slug: 'mercado', tenant: tenantId },
    })

    const updated = await payload.update({
      collection: 'categories',
      id: category.id,
      data: { slug: 'Mercado-De-Pases' },
    })

    expect(updated.slug).toBe('mercado-de-pases')
  })
})

describe('Tags', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
    tenantId = await seedTenant(payload)
  })

  it('creates and reads back a tag', async () => {
    const tag = await payload.create({
      collection: 'tags',
      data: {
        name: 'Elections',
        slug: 'elections',
        description: 'Election coverage.',
        tenant: tenantId,
      },
    })

    const found = await payload.findByID({ collection: 'tags', id: tag.id })

    expect(found.name).toBe('Elections')
    expect(found.slug).toBe('elections')
  })

  it('lowercases and trims the slug on create (BLO-160)', async () => {
    const tag = await payload.create({
      collection: 'tags',
      data: { name: 'Champions League', slug: ' Champions-League ', tenant: tenantId },
    })

    expect(tag.slug).toBe('champions-league')
  })
})
