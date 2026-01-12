import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. Add nullable org_slug column
  await db.schema.alterTable("tenants").addColumn("org_slug", "text").execute();

  // 2. Backfill from organizations for existing org_slug format tenants
  await sql`
    UPDATE tenants
    SET org_slug = (
      SELECT organizations.slug
      FROM organizations
      WHERE organizations.id = tenants.organization_id
    )
    WHERE url_format = 'org_slug'
    AND organization_id IS NOT NULL
  `.execute(db);

  // 3. Add constraint: org_slug format requires org_slug value
  await sql`
    ALTER TABLE tenants
    ADD CONSTRAINT check_org_slug_format
    CHECK (url_format != 'org_slug' OR org_slug IS NOT NULL)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE tenants DROP CONSTRAINT check_org_slug_format`.execute(
    db,
  );
  await db.schema.alterTable("tenants").dropColumn("org_slug").execute();
}
