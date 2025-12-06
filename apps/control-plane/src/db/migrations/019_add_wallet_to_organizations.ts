import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("organizations")
    .addColumn("wallet_config", "jsonb")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("organizations")
    .dropColumn("wallet_config")
    .execute();
}
