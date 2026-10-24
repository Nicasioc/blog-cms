import type { Access, FieldAccess } from 'payload'
import type { User } from '../payload-types'

type MaybeUser = Pick<User, 'roles'> | null | undefined

export const isAdmin = (user: MaybeUser): boolean => Boolean(user?.roles?.includes('admin'))

/** Staff are humans who author content: admins and editors. Service (API-key) users are not staff. */
export const isStaff = (user: MaybeUser): boolean =>
  Boolean(user?.roles?.includes('admin') || user?.roles?.includes('editor'))

export const isService = (user: MaybeUser): boolean => Boolean(user?.roles?.includes('service'))

export const adminOnly: Access = ({ req: { user } }) => isAdmin(user)

export const staffOnly: Access = ({ req: { user } }) => isStaff(user)

export const adminOnlyField: FieldAccess = ({ req: { user } }) => isAdmin(user)
