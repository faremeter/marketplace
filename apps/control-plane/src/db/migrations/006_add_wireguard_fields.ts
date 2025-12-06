import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("nodes")
    .addColumn("wireguard_public_key", "text")
    .execute();

  await db.schema
    .alterTable("nodes")
    .addColumn("wireguard_address", "text")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("nodes").dropColumn("wireguard_address").execute();
  await db.schema
    .alterTable("nodes")
    .dropColumn("wireguard_public_key")
    .execute();
}
