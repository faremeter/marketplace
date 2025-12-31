import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE transactions ADD COLUMN ngx_request_id VARCHAR(32)`.execute(
    db,
  );
  await sql`UPDATE transactions SET ngx_request_id = LPAD(id::text, 32, '0') WHERE ngx_request_id IS NULL`.execute(
    db,
  );
  await sql`ALTER TABLE transactions ALTER COLUMN ngx_request_id SET NOT NULL`.execute(
    db,
  );
  await sql`CREATE UNIQUE INDEX idx_transactions_ngx_request_id ON transactions(ngx_request_id)`.execute(
    db,
  );
  await sql`ALTER TABLE transactions ALTER COLUMN tx_hash DROP NOT NULL`.execute(
    db,
  );
  await sql`ALTER TABLE transactions ALTER COLUMN network DROP NOT NULL`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DELETE FROM transactions WHERE tx_hash IS NULL`.execute(db);
  await sql`ALTER TABLE transactions ALTER COLUMN network SET NOT NULL`.execute(
    db,
  );
  await sql`ALTER TABLE transactions ALTER COLUMN tx_hash SET NOT NULL`.execute(
    db,
  );
  await sql`DROP INDEX idx_transactions_ngx_request_id`.execute(db);
  await sql`ALTER TABLE transactions DROP COLUMN ngx_request_id`.execute(db);
}
