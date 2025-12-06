import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("tenant_nodes")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("tenant_id", "integer", (col) =>
      col.notNull().references("tenants.id").onDelete("cascade"),
    )
    .addColumn("node_id", "integer", (col) =>
      col.notNull().references("nodes.id").onDelete("cascade"),
    )
    .addColumn("is_primary", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("health_check_id", "varchar(255)")
    .addColumn("cert_status", "varchar(50)", (col) => col.defaultTo("pending"))
    .addColumn("created_at", "timestamp", (col) =>
      col.notNull().defaultTo(db.fn("now")),
    )
    .addUniqueConstraint("tenant_nodes_tenant_node_unique", [
      "tenant_id",
      "node_id",
    ])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("tenant_nodes").execute();
}
