import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("tenants")
    .addColumn("organization_id", "integer", (col) =>
      col.references("organizations.id").onDelete("set null"),
    )
    .execute();

  await db.schema
    .createIndex("idx_tenants_org")
    .on("tenants")
    .column("organization_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex("idx_tenants_org").execute();
  await db.schema.alterTable("tenants").dropColumn("organization_id").execute();
}
