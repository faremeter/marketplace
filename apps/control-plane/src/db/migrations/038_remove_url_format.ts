import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. Drop constraint from migration 037 (references url_format)
  await sql`ALTER TABLE tenants DROP CONSTRAINT IF EXISTS check_org_slug_format`.execute(
    db,
  );

  // 2. Drop partial indexes from migration 036 (reference url_format)
  await sql`DROP INDEX IF EXISTS idx_tenants_name_legacy_unique`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_tenants_name_org_unique`.execute(db);

  // 3. Recreate indexes using org_slug nullability
  await sql`
    CREATE UNIQUE INDEX idx_tenants_name_legacy
    ON tenants (name)
    WHERE org_slug IS NULL
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX idx_tenants_name_org
    ON tenants (name, org_slug)
    WHERE org_slug IS NOT NULL
  `.execute(db);

  // 4. Drop url_format column
  await db.schema.alterTable("tenants").dropColumn("url_format").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Re-add url_format column
  await db.schema
    .alterTable("tenants")
    .addColumn("url_format", "varchar(20)", (col) =>
      col.notNull().defaultTo("legacy"),
    )
    .execute();

  // Derive url_format from org_slug
  await sql`UPDATE tenants SET url_format = 'org_slug' WHERE org_slug IS NOT NULL`.execute(
    db,
  );

  // Restore original indexes (from migration 036)
  await sql`DROP INDEX IF EXISTS idx_tenants_name_legacy`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_tenants_name_org`.execute(db);
  await sql`CREATE UNIQUE INDEX idx_tenants_name_legacy_unique ON tenants (name) WHERE url_format = 'legacy'`.execute(
    db,
  );
  await sql`CREATE UNIQUE INDEX idx_tenants_name_org_unique ON tenants (name, organization_id) WHERE url_format = 'org_slug'`.execute(
    db,
  );

  // Re-add constraint
  await sql`ALTER TABLE tenants ADD CONSTRAINT check_org_slug_format CHECK (url_format != 'org_slug' OR org_slug IS NOT NULL)`.execute(
    db,
  );
}
