import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("endpoints")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("tenant_id", "integer", (col) =>
      col.notNull().references("tenants.id").onDelete("cascade"),
    )
    .addColumn("path_pattern", "text", (col) => col.notNull())
    .addColumn("price_usdc", "integer")
    .addColumn("description", "text")
    .addColumn("priority", "integer", (col) => col.notNull().defaultTo(100))
    .addColumn("is_active", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("created_at", "timestamp", (col) =>
      col.notNull().defaultTo(db.fn("now")),
    )
    .addColumn("deleted_at", "timestamp")
    .execute();

  await db.schema
    .createIndex("idx_endpoints_tenant_id")
    .on("endpoints")
    .column("tenant_id")
    .execute();

  await db.schema
    .createIndex("idx_endpoints_tenant_priority")
    .on("endpoints")
    .columns(["tenant_id", "priority"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("endpoints").execute();
}
