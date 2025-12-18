import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("wallets")
    .addColumn("cached_balances", "jsonb")
    .addColumn("balances_cached_at", "timestamp")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("wallets")
    .dropColumn("cached_balances")
    .dropColumn("balances_cached_at")
    .execute();
}
