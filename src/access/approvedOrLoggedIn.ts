import type { Access } from 'payload'

/** Logged-in users (moderators) see every comment; anonymous requests only see approved ones. */
export const approvedOrLoggedIn: Access = ({ req: { user } }) => {
  if (user) return true

  return {
    status: {
      equals: 'approved',
    },
  }
}
