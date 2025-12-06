import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Copy existing node_id assignments to tenant_nodes junction table
  await sql`
    INSERT INTO tenant_nodes (tenant_id, node_id, is_primary)
    SELECT id, node_id, true
    FROM tenants
    WHERE node_id IS NOT NULL
    ON CONFLICT (tenant_id, node_id) DO NOTHING
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Restore node_id from tenant_nodes (only primary assignments)
  await sql`
    UPDATE tenants t
    SET node_id = tn.node_id
    FROM tenant_nodes tn
    WHERE t.id = tn.tenant_id AND tn.is_primary = true
  `.execute(db);

  // Remove entries that were migrated
  await sql`
    DELETE FROM tenant_nodes
    WHERE is_primary = true
  `.execute(db);
}
