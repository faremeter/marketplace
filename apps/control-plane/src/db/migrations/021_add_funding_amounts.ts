import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("admin_settings")
    .addColumn("default_sol_native_amount", "decimal(10, 6)", (col) =>
      col.defaultTo(0.01).notNull(),
    )
    .addColumn("default_sol_usdc_amount", "decimal(10, 6)", (col) =>
      col.defaultTo(0.01).notNull(),
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("admin_settings")
    .dropColumn("default_sol_native_amount")
    .dropColumn("default_sol_usdc_amount")
    .execute();
}
