import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_name_key`.execute(
    db,
  );

  await sql`
    CREATE UNIQUE INDEX idx_tenants_name_legacy_unique
    ON tenants(name)
    WHERE url_format = 'legacy'
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX idx_tenants_name_org_unique
    ON tenants(name, organization_id)
    WHERE url_format = 'org_slug'
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_tenants_name_legacy_unique`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_tenants_name_org_unique`.execute(db);

  await sql`ALTER TABLE tenants ADD CONSTRAINT tenants_name_key UNIQUE (name)`.execute(
    db,
  );
}
