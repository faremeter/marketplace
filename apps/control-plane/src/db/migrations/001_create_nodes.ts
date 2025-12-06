import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("nodes")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("name", "varchar(255)", (col) => col.notNull().unique())
    .addColumn("internal_ip", "varchar(45)", (col) => col.notNull())
    .addColumn("public_ip", "varchar(45)")
    .addColumn("status", "varchar(20)", (col) =>
      col.notNull().defaultTo("active"),
    )
    .addColumn("created_at", "timestamp", (col) =>
      col.notNull().defaultTo(db.fn("now")),
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("nodes").execute();
}
