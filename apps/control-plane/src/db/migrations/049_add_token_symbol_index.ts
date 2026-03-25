import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createIndex("idx_transactions_token_symbol")
    .on("transactions")
    .column("token_symbol")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex("idx_transactions_token_symbol").execute();
}
