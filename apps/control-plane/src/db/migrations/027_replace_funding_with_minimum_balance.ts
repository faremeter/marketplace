import { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("admin_settings")
    .dropColumn("default_sol_native_amount")
    .execute();

  await db.schema
    .alterTable("admin_settings")
    .dropColumn("default_sol_usdc_amount")
    .execute();

  await db.schema
    .alterTable("admin_settings")
    .dropColumn("fee_percentage")
    .execute();

  await db.schema
    .alterTable("admin_settings")
    .addColumn("minimum_balance_usdc", "decimal(10, 4)", (col) =>
      col.defaultTo(0.01).notNull(),
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("admin_settings")
    .dropColumn("minimum_balance_usdc")
    .execute();

  await db.schema
    .alterTable("admin_settings")
    .addColumn("fee_percentage", "decimal(5, 4)", (col) =>
      col.defaultTo(0.01).notNull(),
    )
    .execute();

  await db.schema
    .alterTable("admin_settings")
    .addColumn("default_sol_native_amount", "decimal(10, 6)", (col) =>
      col.defaultTo(0.01).notNull(),
    )
    .execute();

  await db.schema
    .alterTable("admin_settings")
    .addColumn("default_sol_usdc_amount", "decimal(10, 6)", (col) =>
      col.defaultTo(0.01).notNull(),
    )
    .execute();
}
