import type { Access } from 'payload'

/** Fully public — no auth required. Tenant scoping is left to the caller's own query, not enforced here. */
export const publicRead: Access = () => true
