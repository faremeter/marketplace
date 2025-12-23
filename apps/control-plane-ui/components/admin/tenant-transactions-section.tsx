"use client";

import { AdminTransactionsTable } from "./admin-transactions-table";

interface Tenant {
  id: number;
  name: string;
  organization_id: number | null;
  organization_name: string | null;
}

interface TenantTransactionsSectionProps {
  tenant: Tenant;
}

export function TenantTransactionsSection({
  tenant,
}: TenantTransactionsSectionProps) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-lg font-semibold text-gray-12">{tenant.name}</h2>
        <code className="text-xs text-gray-11">
          https://{tenant.name}.api.corbits.dev
        </code>
      </div>
      <AdminTransactionsTable tenantId={tenant.id} pageSize={10} />
    </div>
  );
}
