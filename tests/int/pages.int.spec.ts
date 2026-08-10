import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { describe, it, beforeAll, expect } from 'vitest'
import { lexicalContent } from '../helpers/lexicalContent'
import { seedTenant } from '../helpers/seedTenant'

let payload: Payload
let tenantId: number

describe('Pages', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
    tenantId = await seedTenant(payload)
  })

  it('creates and publishes a page', async () => {
    const page = await payload.create({
      collection: 'pages',
      data: {
        title: 'About Us',
        slug: 'about-us',
        content: lexicalContent('About us copy.'),
        tenant: tenantId,
        _status: 'published',
      },
    })

    const found = await payload.findByID({ collection: 'pages', id: page.id })

    expect(found.title).toBe('About Us')
    expect(found._status).toBe('published')
  })
})
