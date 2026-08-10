import type { Payload } from 'payload'

let counter = 0

/** Creates a tenant with a unique slug per call, for tests that need a valid tenant ID. */
export const seedTenant = async (payload: Payload): Promise<number> => {
  counter += 1
  const tenant = await payload.create({
    collection: 'tenants',
    data: {
      name: `Test Tenant ${counter}`,
      slug: `test-tenant-${counter}-${Date.now()}`,
      blogUrl: 'https://example.com',
      revalidateSecret: 'test-revalidate-secret-1234567890',
    },
  })

  return tenant.id
}
