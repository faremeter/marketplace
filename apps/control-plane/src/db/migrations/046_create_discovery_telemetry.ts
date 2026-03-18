import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("discovery_telemetry")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("event_type", "text", (col) => col.notNull())
    .addColumn("event_key", "text")
    .addColumn("proxy_id", "integer", (col) =>
      col.references("tenants.id").onDelete("cascade"),
    )
    .addColumn("endpoint_id", "integer", (col) =>
      col.references("endpoints.id").onDelete("cascade"),
    )
    .addColumn("bucket", "timestamptz", (col) => col.notNull())
    .addColumn("count", "integer", (col) => col.notNull().defaultTo(1))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await sql`
    CREATE UNIQUE INDEX idx_telemetry_search
    ON discovery_telemetry (event_type, event_key, bucket)
    WHERE event_type = 'search'
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX idx_telemetry_view
    ON discovery_telemetry (event_type, proxy_id, COALESCE(endpoint_id, 0), bucket)
    WHERE event_type = 'view'
  `.execute(db);

  await db.schema
    .createIndex("idx_telemetry_bucket")
    .on("discovery_telemetry")
    .column("bucket")
    .execute();

  await db.schema
    .createIndex("idx_telemetry_event_type")
    .on("discovery_telemetry")
    .columns(["event_type", "bucket"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex("idx_telemetry_event_type").execute();
  await db.schema.dropIndex("idx_telemetry_bucket").execute();
  await sql`DROP INDEX IF EXISTS idx_telemetry_view`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_telemetry_search`.execute(db);
  await db.schema.dropTable("discovery_telemetry").execute();
}
