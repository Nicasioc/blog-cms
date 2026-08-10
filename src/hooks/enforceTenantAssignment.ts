import type { CollectionBeforeChangeHook } from 'payload'

/**
 * The multi-tenant plugin's `filterOptions` on the tenant field only limits
 * which tenants show up in the Admin UI dropdown — it's not server-side
 * enforcement. Without this hook, a non-admin user's API key could assign any
 * tenant ID to a document, not just their own. Admins (userHasAccessToAllTenants
 * in payload.config.ts) are exempt, matching the same rule used everywhere else.
 */
export const enforceTenantAssignment: CollectionBeforeChangeHook = ({ data, req }) => {
  if (!req.user) return data
  if (req.user.roles?.includes('admin')) return data

  const submittedTenant = data?.tenant
  if (submittedTenant == null) return data

  const submittedTenantId =
    typeof submittedTenant === 'object' && submittedTenant !== null
      ? submittedTenant.id
      : submittedTenant

  const userTenantIds = (req.user.tenants ?? []).map((row) =>
    typeof row.tenant === 'object' && row.tenant !== null ? row.tenant.id : row.tenant,
  )

  if (!userTenantIds.includes(submittedTenantId)) {
    throw new Error(`You do not have access to assign tenant ${submittedTenantId}`)
  }

  return data
}
