import { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("waitlist")
    .addColumn("whitelisted", "boolean", (col) =>
      col.notNull().defaultTo(false),
    )
    .addColumn("signed_up", "boolean", (col) => col.notNull().defaultTo(false))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("waitlist")
    .dropColumn("whitelisted")
    .dropColumn("signed_up")
    .execute();
}
