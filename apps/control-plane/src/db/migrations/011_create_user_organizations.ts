import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("user_organizations")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("user_id", "integer", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("organization_id", "integer", (col) =>
      col.notNull().references("organizations.id").onDelete("cascade"),
    )
    .addColumn("role", "varchar(50)", (col) => col.defaultTo("member"))
    .addColumn("joined_at", "timestamp", (col) => col.defaultTo(db.fn("now")))
    .addUniqueConstraint("unique_user_org", ["user_id", "organization_id"])
    .execute();

  await db.schema
    .createIndex("idx_user_orgs_user")
    .on("user_organizations")
    .column("user_id")
    .execute();

  await db.schema
    .createIndex("idx_user_orgs_org")
    .on("user_organizations")
    .column("organization_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex("idx_user_orgs_org").execute();
  await db.schema.dropIndex("idx_user_orgs_user").execute();
  await db.schema.dropTable("user_organizations").execute();
}
