import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("transactions")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("endpoint_id", "integer", (col) =>
      col.references("endpoints.id").onDelete("set null"),
    )
    .addColumn("tenant_id", "integer", (col) =>
      col.notNull().references("tenants.id").onDelete("cascade"),
    )
    .addColumn("amount_usdc", "integer", (col) => col.notNull())
    .addColumn("tx_hash", "text", (col) => col.notNull())
    .addColumn("network", "varchar(50)", (col) => col.notNull())
    .addColumn("request_path", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamp", (col) =>
      col.notNull().defaultTo(db.fn("now")),
    )
    .execute();

  await db.schema
    .createIndex("idx_transactions_endpoint_id")
    .on("transactions")
    .column("endpoint_id")
    .execute();

  await db.schema
    .createIndex("idx_transactions_tenant_id")
    .on("transactions")
    .column("tenant_id")
    .execute();

  await db.schema
    .createIndex("idx_transactions_created_at")
    .on("transactions")
    .column("created_at")
    .execute();

  await db.schema
    .createIndex("idx_transactions_tx_hash")
    .on("transactions")
    .column("tx_hash")
    .unique()
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("transactions").execute();
}
