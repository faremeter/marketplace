import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("organization_invitations")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("organization_id", "integer", (col) =>
      col.notNull().references("organizations.id").onDelete("cascade"),
    )
    .addColumn("email", "varchar(255)", (col) => col.notNull())
    .addColumn("token", "varchar(64)", (col) => col.notNull().unique())
    .addColumn("role", "varchar(50)", (col) => col.defaultTo("member"))
    .addColumn("invited_by", "integer", (col) =>
      col.references("users.id").onDelete("set null"),
    )
    .addColumn("expires_at", "timestamp", (col) => col.notNull())
    .addColumn("accepted_at", "timestamp")
    .addColumn("created_at", "timestamp", (col) => col.defaultTo(db.fn("now")))
    .execute();

  await db.schema
    .createIndex("idx_invitations_org")
    .on("organization_invitations")
    .column("organization_id")
    .execute();

  await db.schema
    .createIndex("idx_invitations_token")
    .on("organization_invitations")
    .column("token")
    .execute();

  await db.schema
    .createIndex("idx_invitations_email")
    .on("organization_invitations")
    .column("email")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex("idx_invitations_email").execute();
  await db.schema.dropIndex("idx_invitations_token").execute();
  await db.schema.dropIndex("idx_invitations_org").execute();
  await db.schema.dropTable("organization_invitations").execute();
}
