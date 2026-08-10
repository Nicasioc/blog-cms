import type { Access } from 'payload'

/**
 * Logged-in users (editors) see every status, including drafts, within their
 * own tenant (the multi-tenant plugin layers that constraint on top of this).
 * Anonymous requests only ever see published docs.
 */
export const publishedOrLoggedIn: Access = ({ req: { user } }) => {
  if (user) return true

  return {
    _status: {
      equals: 'published',
    },
  }
}
