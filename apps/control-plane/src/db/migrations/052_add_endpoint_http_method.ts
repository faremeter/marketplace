import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("endpoints")
    .addColumn("http_method", "text", (col) => col.defaultTo("ANY").notNull())
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("endpoints").dropColumn("http_method").execute();
}
