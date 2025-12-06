import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("tenants")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("name", "varchar(255)", (col) => col.notNull().unique())
    .addColumn("api_key", "varchar(255)", (col) => col.notNull().unique())
    .addColumn("backend_url", "text", (col) => col.notNull())
    .addColumn("node_id", "integer", (col) =>
      col.references("nodes.id").onDelete("set null"),
    )
    .addColumn("wallet_config", "jsonb", (col) => col.notNull())
    .addColumn("price_usdc", "integer", (col) => col.notNull())
    .addColumn("is_active", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("created_at", "timestamp", (col) =>
      col.notNull().defaultTo(db.fn("now")),
    )
    .execute();

  await db.schema
    .createIndex("idx_tenants_api_key")
    .on("tenants")
    .column("api_key")
    .execute();

  await db.schema
    .createIndex("idx_tenants_node_id")
    .on("tenants")
    .column("node_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("tenants").execute();
}
