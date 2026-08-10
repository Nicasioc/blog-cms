import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'
import { triggerRevalidate } from './triggerRevalidate'

type RevalidatableDoc = {
  id: number
  _status?: ('draft' | 'published') | null
  slug?: string | null
  tenant?: number | { id: number } | null
}

const tenantId = (tenant: RevalidatableDoc['tenant']): number | null => {
  if (tenant == null) return null
  return typeof tenant === 'object' ? tenant.id : tenant
}

/**
 * Fires on Posts/Pages afterChange. Only published docs are ever cached
 * publicly, so drafts (including autosaves) don't need revalidation — only
 * fires when the doc's current status is 'published'. If the slug changed
 * while published, the old slug's cached page needs purging too, or it'll
 * keep serving stale content at a URL that no longer resolves to this doc.
 */
export const revalidatePostOrPage: CollectionAfterChangeHook<RevalidatableDoc> = async ({
  doc,
  previousDoc,
  req,
}) => {
  const tid = tenantId(doc.tenant)
  if (!tid || doc._status !== 'published' || !doc.slug) return doc

  await triggerRevalidate({ payload: req.payload, tenantId: tid, slug: doc.slug })

  if (previousDoc?.slug && previousDoc.slug !== doc.slug) {
    await triggerRevalidate({ payload: req.payload, tenantId: tid, slug: previousDoc.slug })
  }

  return doc
}

/** Fires on Posts/Pages afterDelete — only published docs were ever cached publicly. */
export const revalidatePostOrPageOnDelete: CollectionAfterDeleteHook<RevalidatableDoc> = async ({
  doc,
  req,
}) => {
  const tid = tenantId(doc.tenant)
  if (!tid || doc._status !== 'published' || !doc.slug) return doc

  await triggerRevalidate({ payload: req.payload, tenantId: tid, slug: doc.slug })

  return doc
}
