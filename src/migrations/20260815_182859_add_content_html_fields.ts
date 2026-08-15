import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "posts" ADD COLUMN "content_html" varchar;
  ALTER TABLE "_posts_v" ADD COLUMN "version_content_html" varchar;
  ALTER TABLE "pages" ADD COLUMN "content_html" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_content_html" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "posts" DROP COLUMN "content_html";
  ALTER TABLE "_posts_v" DROP COLUMN "version_content_html";
  ALTER TABLE "pages" DROP COLUMN "content_html";
  ALTER TABLE "_pages_v" DROP COLUMN "version_content_html";`)
}
