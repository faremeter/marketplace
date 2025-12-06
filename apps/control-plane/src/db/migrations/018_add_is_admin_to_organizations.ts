import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("organizations")
    .addColumn("is_admin", "boolean", (col) => col.defaultTo(false).notNull())
    .execute();

  // Partial unique index ensures only one org can have is_admin = true
  await sql`CREATE UNIQUE INDEX idx_one_admin_org ON organizations(is_admin) WHERE is_admin = true`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex("idx_one_admin_org").execute();
  await db.schema.alterTable("organizations").dropColumn("is_admin").execute();
}
