import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("tenants")
    .addColumn("default_scheme", "text", (col) =>
      col.notNull().defaultTo("exact"),
    )
    .execute();

  await db.schema.alterTable("endpoints").addColumn("scheme", "text").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("endpoints").dropColumn("scheme").execute();
  await db.schema.alterTable("tenants").dropColumn("default_scheme").execute();
}
