import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("tenants")
    .renameColumn("price_usdc", "default_price_usdc")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("tenants")
    .renameColumn("default_price_usdc", "price_usdc")
    .execute();
}
