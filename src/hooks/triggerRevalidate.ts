import type { Payload } from 'payload'

/**
 * POSTs {slug} to the tenant's own /api/revalidate webhook (unchanged from the
 * blog's existing route — it has no CMS-specific logic). Best-effort: a failed
 * webhook call shouldn't fail the save that triggered it, just gets logged.
 */
export const triggerRevalidate = async ({
  payload,
  tenantId,
  slug,
}: {
  payload: Payload
  tenantId: number
  slug: string
}): Promise<void> => {
  try {
    const tenant = await payload.findByID({ collection: 'tenants', id: tenantId })

    const url = `${tenant.blogUrl}/api/revalidate?secret=${tenant.revalidateSecret}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
    })

    if (!res.ok) {
      payload.logger.warn(`Revalidation webhook failed for slug "${slug}": ${res.status}`)
    }
  } catch (err) {
    payload.logger.warn(`Revalidation webhook error for slug "${slug}": ${(err as Error).message}`)
  }
}
