import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("tenants")
    .addColumn("wallet_status", "varchar(20)", (col) =>
      col.defaultTo("funded").notNull(),
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("tenants").dropColumn("wallet_status").execute();
}
