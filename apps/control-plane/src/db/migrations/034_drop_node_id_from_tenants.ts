import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_tenants_node_id`.execute(db);
  await db.schema.alterTable("tenants").dropColumn("node_id").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("tenants")
    .addColumn("node_id", "integer", (col) =>
      col.references("nodes.id").onDelete("set null"),
    )
    .execute();

  await db.schema
    .createIndex("idx_tenants_node_id")
    .on("tenants")
    .column("node_id")
    .execute();
}
