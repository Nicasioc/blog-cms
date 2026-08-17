import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "posts" ADD COLUMN "featured" boolean DEFAULT false;
  ALTER TABLE "_posts_v" ADD COLUMN "version_featured" boolean DEFAULT false;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "posts" DROP COLUMN "featured";
  ALTER TABLE "_posts_v" DROP COLUMN "version_featured";`)
}
