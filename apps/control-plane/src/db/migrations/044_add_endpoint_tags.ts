import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE endpoints ADD COLUMN tags text[] DEFAULT '{}'`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("endpoints").dropColumn("tags").execute();
}
