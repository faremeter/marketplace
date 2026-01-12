"use client";

import { useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/api/client";
import { MagnifyingGlassIcon } from "@radix-ui/react-icons";
import { TenantTransactionsSection } from "@/components/admin/tenant-transactions-section";

interface Tenant {
  id: number;
  name: string;
  organization_id: number | null;
  organization_name: string | null;
  org_slug?: string | null;
}

export default function AdminTransactionsPage() {
  const [search, setSearch] = useState("");

  const { data: tenants, isLoading } = useSWR<Tenant[]>(
    "/api/admin/tenants-with-wallets",
    api.get,
  );

  const filteredTenants =
    tenants?.filter(
      (t) =>
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.organization_name?.toLowerCase().includes(search.toLowerCase()),
    ) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-12">Transactions</h1>
          <p className="text-sm text-gray-11">API transactions by tenant</p>
        </div>
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-11" />
          <input
            type="text"
            placeholder="Search tenants..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 rounded-md border border-gray-6 bg-gray-3 py-2 pl-9 pr-3 text-sm text-gray-12 placeholder:text-gray-11 focus:border-accent-8 focus:outline-none"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-6 border-t-accent-9" />
        </div>
      ) : filteredTenants.length ? (
        <div className="space-y-8">
          {filteredTenants.map((tenant) => (
            <TenantTransactionsSection key={tenant.id} tenant={tenant} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-gray-6 bg-gray-2 p-6 text-center">
          <p className="text-sm text-gray-11">No tenants found.</p>
        </div>
      )}
    </div>
  );
}
