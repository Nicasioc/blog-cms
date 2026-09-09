import type { Field, FieldHook } from 'payload'

/**
 * Lowercase and trim a slug value. URL paths are case-sensitive, so a
 * hand-entered `Institucionales` and an `institucionales` link resolve to two
 * different pages and split indexing signals — see BLO-160. Kept pure so it can
 * be unit tested without a Payload instance.
 */
export const normalizeSlugValue = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value

const normalizeSlug: FieldHook = ({ value }) => normalizeSlugValue(value)

/**
 * Shared `slug` field for the taxonomy-style collections (categories, tags,
 * posts, pages). Identical text field they each declared inline, now with a
 * `beforeValidate` hook so the stored value — and the uniqueness check — always
 * see the normalized form.
 */
export const slugField: Field = {
  name: 'slug',
  type: 'text',
  required: true,
  unique: true,
  index: true,
  hooks: {
    beforeValidate: [normalizeSlug],
  },
}
