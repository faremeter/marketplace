import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("admin_settings")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("wallet_config", "jsonb")
    .addColumn("fee_percentage", "decimal(5, 4)", (col) =>
      col.defaultTo(0.05).notNull(),
    )
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`now()`).notNull(),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`now()`).notNull(),
    )
    .execute();

  // Insert singleton row with default 5% fee
  await sql`INSERT INTO admin_settings (fee_percentage) VALUES (0.05)`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("admin_settings").execute();
}
