import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add openapi_spec JSONB column to tenants
  await db.schema
    .alterTable("tenants")
    .addColumn("openapi_spec", "jsonb")
    .execute();

  // Add openapi_source_paths text[] column to endpoints (for lineage tracking)
  await sql`
    ALTER TABLE endpoints
    ADD COLUMN openapi_source_paths text[]
  `.execute(db);

  // Add path column to store original user input for display
  await db.schema.alterTable("endpoints").addColumn("path", "text").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("tenants").dropColumn("openapi_spec").execute();
  await db.schema
    .alterTable("endpoints")
    .dropColumn("openapi_source_paths")
    .execute();
  await db.schema.alterTable("endpoints").dropColumn("path").execute();
}
