import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("tenants")
    .addColumn("url_format", "varchar(20)", (col) =>
      col.notNull().defaultTo("legacy"),
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("tenants").dropColumn("url_format").execute();
}
