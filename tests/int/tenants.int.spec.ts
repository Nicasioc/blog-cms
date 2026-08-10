import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { describe, it, beforeAll, expect } from 'vitest'

let payload: Payload

describe('Tenants', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
  })

  it('creates and reads back a tenant', async () => {
    const tenant = await payload.create({
      collection: 'tenants',
      data: {
        name: 'Debate Cuervo',
        slug: 'debate-cuervo',
        blogUrl: 'https://debate-cuervo.example.com',
        revalidateSecret: 'test-revalidate-secret-1234567890',
      },
    })

    const found = await payload.findByID({
      collection: 'tenants',
      id: tenant.id,
    })

    expect(found.slug).toBe('debate-cuervo')
    expect(found.blogUrl).toBe('https://debate-cuervo.example.com')
  })

  it('rejects a duplicate slug', async () => {
    await payload.create({
      collection: 'tenants',
      data: {
        name: 'First',
        slug: 'duplicate-tenant-slug',
        blogUrl: 'https://first.example.com',
        revalidateSecret: 'test-revalidate-secret-1234567890',
      },
    })

    await expect(
      payload.create({
        collection: 'tenants',
        data: {
          name: 'Second',
          slug: 'duplicate-tenant-slug',
          blogUrl: 'https://second.example.com',
          revalidateSecret: 'test-revalidate-secret-1234567890',
        },
      }),
    ).rejects.toThrow()
  })
})
