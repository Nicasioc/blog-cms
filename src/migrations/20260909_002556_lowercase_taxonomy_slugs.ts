import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * BLO-160: hand-entered category/tag slugs were stored with mixed case
 * (e.g. `Institucionales`), so `/category/Institucionales` and
 * `/category/institucionales` resolved to different pages and split indexing
 * signals. `slugField`'s beforeValidate hook now normalizes new writes; this
 * backfills the rows that already exist.
 *
 * Data-only — no schema change, so the `.json` snapshot is copied unchanged.
 * If two rows in the same table differ only by case the UPDATE hits the unique
 * constraint and the whole migration rolls back — that's the intended signal to
 * merge them by hand first.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    UPDATE "categories" SET "slug" = lower("slug") WHERE "slug" <> lower("slug");
    UPDATE "tags" SET "slug" = lower("slug") WHERE "slug" <> lower("slug");
  `)
}

export async function down({}: MigrateDownArgs): Promise<void> {
  // The original casing isn't stored anywhere, so lowercasing can't be undone.
}
