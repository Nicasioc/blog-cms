import type { Access } from 'payload'
import { isStaff } from './roles'

/**
 * Staff (moderators) see every comment; anonymous requests and service (API-key)
 * users only see approved ones.
 */
export const approvedOrLoggedIn: Access = ({ req: { user } }) => {
  if (isStaff(user)) return true

  return {
    status: {
      equals: 'approved',
    },
  }
}
