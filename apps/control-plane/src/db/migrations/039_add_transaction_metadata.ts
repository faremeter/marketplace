import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE transactions ADD COLUMN client_ip inet`.execute(db);
  await sql`ALTER TABLE transactions ADD COLUMN request_method varchar(10)`.execute(
    db,
  );
  await sql`ALTER TABLE transactions ADD COLUMN metadata jsonb`.execute(db);

  await sql`CREATE INDEX idx_transactions_client_ip ON transactions(client_ip)`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX idx_transactions_client_ip`.execute(db);
  await sql`ALTER TABLE transactions DROP COLUMN metadata`.execute(db);
  await sql`ALTER TABLE transactions DROP COLUMN request_method`.execute(db);
  await sql`ALTER TABLE transactions DROP COLUMN client_ip`.execute(db);
}
