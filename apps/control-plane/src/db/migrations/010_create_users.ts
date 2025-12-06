import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("users")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("email", "varchar(255)", (col) => col.notNull().unique())
    .addColumn("password_hash", "text", (col) => col.notNull())
    .addColumn("is_admin", "boolean", (col) => col.defaultTo(false))
    .addColumn("email_verified", "boolean", (col) => col.defaultTo(false))
    .addColumn("verification_token", "text")
    .addColumn("verification_expires", "timestamp")
    .addColumn("created_at", "timestamp", (col) => col.defaultTo(db.fn("now")))
    .execute();

  await db.schema
    .createIndex("idx_users_email")
    .on("users")
    .column("email")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex("idx_users_email").execute();
  await db.schema.dropTable("users").execute();
}
