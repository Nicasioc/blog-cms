import type { Access } from 'payload'
import { isStaff } from './roles'

/**
 * Staff (admins and editors) see every status, including drafts, within their
 * own tenant (the multi-tenant plugin layers that constraint on top of this).
 * Anonymous requests and service (API-key) users only ever see published docs.
 */
export const publishedOrLoggedIn: Access = ({ req: { user } }) => {
  if (isStaff(user)) return true

  return {
    _status: {
      equals: 'published',
    },
  }
}
