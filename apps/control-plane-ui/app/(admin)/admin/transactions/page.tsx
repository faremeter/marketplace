"use client";

import useSWR from "swr";
import { api } from "@/lib/api/client";
import { TenantTransactionsSection } from "@/components/admin/tenant-transactions-section";

interface Tenant {
  id: number;
  name: string;
  organization_id: number | null;
  organization_name: string | null;
}

export default function AdminTransactionsPage() {
  const { data: tenants, isLoading } = useSWR<Tenant[]>(
    "/api/admin/tenants-with-wallets",
    api.get,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-12">
          Corbits Transactions
        </h1>
        <p className="text-sm text-gray-11">
          Blockchain transactions by tenant from Corbits Dash
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-6 border-t-accent-9" />
        </div>
      ) : tenants?.length ? (
        <div className="space-y-8">
          {tenants.map((tenant) => (
            <TenantTransactionsSection key={tenant.id} tenant={tenant} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-gray-6 bg-gray-2 p-6 text-center">
          <p className="text-sm text-gray-11">No tenants with wallets found.</p>
        </div>
      )}
    </div>
  );
}
