import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("tenants").dropColumn("api_key").execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("upstream_auth_header", "text")
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("upstream_auth_value", "text")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("tenants")
    .dropColumn("upstream_auth_value")
    .execute();

  await db.schema
    .alterTable("tenants")
    .dropColumn("upstream_auth_header")
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("api_key", "varchar(255)", (col) => col.notNull().unique())
    .execute();
}
