import type { CollectionAfterChangeHook } from 'payload'
import { triggerRevalidate } from './triggerRevalidate'

type CommentDoc = {
  id: number
  post?: number | { id: number; slug?: string | null } | null
  status?: ('pending' | 'approved' | 'spam') | null
  tenant?: number | { id: number } | null
}

const idOf = (value: number | { id: number } | null | undefined): number | null => {
  if (value == null) return null
  return typeof value === 'object' ? value.id : value
}

/**
 * Fires on Comments afterChange, but only when the comment is approved — raw
 * submission always defaults to 'pending' (see forcePendingOnCreate), so this
 * only actually triggers on the moderation approval step, not on every
 * submission. Comments don't have their own public page, so this purges the
 * related Post's slug instead of the comment's own (nonexistent) one.
 */
export const revalidateOnCommentApproval: CollectionAfterChangeHook<CommentDoc> = async ({
  doc,
  req,
}) => {
  const tid = idOf(doc.tenant)
  const postId = idOf(doc.post)
  if (!tid || !postId || doc.status !== 'approved') return doc

  const post = await req.payload.findByID({ collection: 'posts', id: postId })
  if (!post?.slug) return doc

  await triggerRevalidate({ payload: req.payload, tenantId: tid, slug: post.slug })

  return doc
}
