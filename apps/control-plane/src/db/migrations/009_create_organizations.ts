import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("organizations")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("name", "varchar(255)", (col) => col.notNull())
    .addColumn("slug", "varchar(255)", (col) => col.notNull().unique())
    .addColumn("created_at", "timestamp", (col) => col.defaultTo(db.fn("now")))
    .execute();

  await db.schema
    .createIndex("idx_organizations_slug")
    .on("organizations")
    .column("slug")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex("idx_organizations_slug").execute();
  await db.schema.dropTable("organizations").execute();
}
