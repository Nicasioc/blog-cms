import type { Payload } from 'payload'
import { randomUUID } from 'crypto'

/**
 * Creates a tenant with a unique slug per call, for tests that need a valid
 * tenant ID. Uses a UUID rather than a counter/timestamp — vitest runs test
 * files in parallel worker processes, so a per-file counter or Date.now()
 * alone can collide across files running in the same millisecond.
 */
export const seedTenant = async (payload: Payload): Promise<number> => {
  const tenant = await payload.create({
    collection: 'tenants',
    data: {
      name: `Test Tenant ${randomUUID()}`,
      slug: `test-tenant-${randomUUID()}`,
      blogUrl: 'https://example.com',
      revalidateSecret: 'test-revalidate-secret-1234567890',
    },
  })

  return tenant.id
}
