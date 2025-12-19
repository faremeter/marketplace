import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("organizations")
    .addColumn("onboarding_completed", "boolean", (col) =>
      col.defaultTo(false).notNull(),
    )
    .addColumn("onboarding_completed_at", "timestamp")
    .execute();

  // Mark existing orgs with wallet + funded wallet + proxy + endpoint as onboarding complete
  await sql`
    UPDATE organizations
    SET onboarding_completed = true, onboarding_completed_at = NOW()
    WHERE id IN (
      SELECT DISTINCT o.id
      FROM organizations o
      INNER JOIN wallets w ON w.organization_id = o.id
      INNER JOIN wallets wf ON wf.organization_id = o.id AND wf.funding_status = 'funded'
      INNER JOIN tenants t ON t.organization_id = o.id
      INNER JOIN endpoints e ON e.tenant_id = t.id AND e.is_active = true
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("organizations")
    .dropColumn("onboarding_completed_at")
    .execute();
  await db.schema
    .alterTable("organizations")
    .dropColumn("onboarding_completed")
    .execute();
}
