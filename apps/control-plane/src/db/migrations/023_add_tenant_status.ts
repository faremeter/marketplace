import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("tenants")
    .addColumn("status", "varchar(50)", (col) =>
      col.defaultTo("pending").notNull(),
    )
    .execute();

  // Set existing tenants to active only if wallet is funded AND all certs are provisioned
  await sql`
    UPDATE tenants SET status = 'active'
    WHERE wallet_status = 'funded'
    AND NOT EXISTS (
      SELECT 1 FROM tenant_nodes
      WHERE tenant_nodes.tenant_id = tenants.id
      AND (tenant_nodes.cert_status IS NULL OR tenant_nodes.cert_status != 'provisioned')
    )
  `.execute(db);

  // Set existing tenants to failed if wallet failed OR any cert failed
  await sql`
    UPDATE tenants SET status = 'failed'
    WHERE status = 'pending'
    AND (
      wallet_status = 'failed'
      OR EXISTS (
        SELECT 1 FROM tenant_nodes
        WHERE tenant_nodes.tenant_id = tenants.id
        AND tenant_nodes.cert_status = 'failed'
      )
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("tenants").dropColumn("status").execute();
}
