import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE tenants ADD COLUMN search_vector tsvector`.execute(db);
  await sql`ALTER TABLE endpoints ADD COLUMN search_vector tsvector`.execute(
    db,
  );

  await sql`
    CREATE FUNCTION tenants_search_vector_update() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector('simple', coalesce(NEW.name, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(NEW.org_slug, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(array_to_string(NEW.tags, ' '), '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(NEW.openapi_spec::text, '')), 'C');
      RETURN NEW;
    END
    $$ LANGUAGE plpgsql
  `.execute(db);

  await sql`
    CREATE TRIGGER tenants_search_vector_trigger
    BEFORE INSERT OR UPDATE OF name, org_slug, tags, openapi_spec
    ON tenants
    FOR EACH ROW
    EXECUTE FUNCTION tenants_search_vector_update()
  `.execute(db);

  await sql`
    CREATE FUNCTION endpoints_search_vector_update() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector('simple', coalesce(NEW.path_pattern, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(NEW.description, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(array_to_string(NEW.tags, ' '), '')), 'B');
      RETURN NEW;
    END
    $$ LANGUAGE plpgsql
  `.execute(db);

  await sql`
    CREATE TRIGGER endpoints_search_vector_trigger
    BEFORE INSERT OR UPDATE OF path_pattern, description, tags
    ON endpoints
    FOR EACH ROW
    EXECUTE FUNCTION endpoints_search_vector_update()
  `.execute(db);

  await sql`
    UPDATE tenants SET search_vector =
      setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
      setweight(to_tsvector('simple', coalesce(org_slug, '')), 'B') ||
      setweight(to_tsvector('simple', coalesce(array_to_string(tags, ' '), '')), 'B') ||
      setweight(to_tsvector('simple', coalesce(openapi_spec::text, '')), 'C')
  `.execute(db);

  await sql`
    UPDATE endpoints SET search_vector =
      setweight(to_tsvector('simple', coalesce(path_pattern, '')), 'A') ||
      setweight(to_tsvector('simple', coalesce(description, '')), 'B') ||
      setweight(to_tsvector('simple', coalesce(array_to_string(tags, ' '), '')), 'B')
  `.execute(db);

  await sql`CREATE INDEX idx_tenants_search_vector ON tenants USING GIN (search_vector)`.execute(
    db,
  );
  await sql`CREATE INDEX idx_endpoints_search_vector ON endpoints USING GIN (search_vector)`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_endpoints_search_vector`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_tenants_search_vector`.execute(db);
  await sql`DROP TRIGGER IF EXISTS endpoints_search_vector_trigger ON endpoints`.execute(
    db,
  );
  await sql`DROP FUNCTION IF EXISTS endpoints_search_vector_update()`.execute(
    db,
  );
  await sql`DROP TRIGGER IF EXISTS tenants_search_vector_trigger ON tenants`.execute(
    db,
  );
  await sql`DROP FUNCTION IF EXISTS tenants_search_vector_update()`.execute(db);
  await sql`ALTER TABLE endpoints DROP COLUMN IF EXISTS search_vector`.execute(
    db,
  );
  await sql`ALTER TABLE tenants DROP COLUMN IF EXISTS search_vector`.execute(
    db,
  );
}
