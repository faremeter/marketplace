import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("nodes").dropColumn("public_ip").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("nodes")
    .addColumn("public_ip", "varchar(45)")
    .execute();
}
