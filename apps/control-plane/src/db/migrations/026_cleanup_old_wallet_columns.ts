import { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("tenants").dropColumn("wallet_config").execute();

  await db.schema.alterTable("tenants").dropColumn("wallet_status").execute();

  await db.schema
    .alterTable("organizations")
    .dropColumn("wallet_config")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("tenants")
    .addColumn("wallet_config", "jsonb")
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("wallet_status", "varchar(20)")
    .execute();

  await db.schema
    .alterTable("organizations")
    .addColumn("wallet_config", "jsonb")
    .execute();
}
