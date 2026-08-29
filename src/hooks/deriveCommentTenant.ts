import type { CollectionBeforeChangeHook } from 'payload'

const idOf = (value: unknown): null | number => {
  if (value == null) return null
  if (typeof value === 'object') {
    return (value as { id?: number }).id ?? null
  }
  return typeof value === 'number' ? value : null
}

/**
 * Comments are publicly submittable (`Comments.create` access), and
 * `enforceTenantAssignment` no-ops for anonymous requests — so without this a
 * public POST could set `tenant` to any id while `post` points at a different
 * tenant's post. On create, ignore any submitted `tenant` and derive it from
 * the referenced post. Updates are left alone (moderators change `status`, not
 * tenancy).
 */
export const deriveCommentTenant: CollectionBeforeChangeHook = async ({ data, operation, req }) => {
  if (operation !== 'create') return data

  const postId = idOf(data?.post)
  if (postId == null) return data

  const post = await req.payload.findByID({
    collection: 'posts',
    id: postId,
    depth: 0,
    req,
  })

  const tenantId = idOf(post?.tenant)
  if (tenantId == null) return data

  return { ...data, tenant: tenantId }
}
