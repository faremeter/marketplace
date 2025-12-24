import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("transactions")
    .addColumn("organization_id", "integer", (col) =>
      col.references("organizations.id").onDelete("set null"),
    )
    .execute();

  await db.schema
    .createIndex("idx_transactions_organization_id")
    .on("transactions")
    .column("organization_id")
    .execute();

  await db.schema
    .createIndex("idx_transactions_tenant_created")
    .on("transactions")
    .columns(["tenant_id", "created_at"])
    .execute();

  await db.schema
    .createIndex("idx_transactions_org_created")
    .on("transactions")
    .columns(["organization_id", "created_at"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .dropIndex("idx_transactions_org_created")
    .on("transactions")
    .execute();

  await db.schema
    .dropIndex("idx_transactions_tenant_created")
    .on("transactions")
    .execute();

  await db.schema
    .dropIndex("idx_transactions_organization_id")
    .on("transactions")
    .execute();

  await db.schema
    .alterTable("transactions")
    .dropColumn("organization_id")
    .execute();
}
