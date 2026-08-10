import type { CollectionBeforeChangeHook } from 'payload'

/**
 * Comments are publicly submittable (see Comments' `create` access), so a
 * client could otherwise set `status: 'approved'` directly on submission.
 * Force new comments to `pending` regardless of what's submitted — moderators
 * change status afterwards via a normal `update`, which this hook doesn't touch.
 */
export const forcePendingOnCreate: CollectionBeforeChangeHook = ({ data, operation }) => {
  if (operation === 'create') {
    return { ...data, status: 'pending' }
  }

  return data
}
