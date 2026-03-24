import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("tenants")
    .renameColumn("default_price_usdc", "default_price")
    .execute();

  await db.schema
    .alterTable("endpoints")
    .renameColumn("price_usdc", "price")
    .execute();

  await db.schema
    .alterTable("transactions")
    .renameColumn("amount_usdc", "amount")
    .execute();

  await db.schema
    .alterTable("transactions")
    .addColumn("token_symbol", "text")
    .execute();

  await db.schema
    .alterTable("transactions")
    .addColumn("mint_address", "text")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("transactions")
    .dropColumn("mint_address")
    .execute();

  await db.schema
    .alterTable("transactions")
    .dropColumn("token_symbol")
    .execute();

  await db.schema
    .alterTable("transactions")
    .renameColumn("amount", "amount_usdc")
    .execute();

  await db.schema
    .alterTable("endpoints")
    .renameColumn("price", "price_usdc")
    .execute();

  await db.schema
    .alterTable("tenants")
    .renameColumn("default_price", "default_price_usdc")
    .execute();
}
