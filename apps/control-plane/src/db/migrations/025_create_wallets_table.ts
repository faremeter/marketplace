import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Create wallets table
  await db.schema
    .createTable("wallets")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("organization_id", "integer", (col) =>
      col.references("organizations.id").onDelete("cascade"),
    )
    .addColumn("name", "varchar(255)", (col) => col.notNull())
    .addColumn("wallet_config", "jsonb", (col) => col.notNull())
    .addColumn("funding_status", "varchar(20)", (col) =>
      col.defaultTo("pending").notNull(),
    )
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`now()`).notNull(),
    )
    .execute();

  // Add wallet_id to tenants
  await db.schema
    .alterTable("tenants")
    .addColumn("wallet_id", "integer", (col) =>
      col.references("wallets.id").onDelete("set null"),
    )
    .execute();

  // Add minimum_balance_sol to admin_settings
  await db.schema
    .alterTable("admin_settings")
    .addColumn("minimum_balance_sol", "decimal(10, 4)", (col) =>
      col.defaultTo(0.01).notNull(),
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("admin_settings")
    .dropColumn("minimum_balance_sol")
    .execute();

  await db.schema.alterTable("tenants").dropColumn("wallet_id").execute();

  await db.schema.dropTable("wallets").execute();
}
