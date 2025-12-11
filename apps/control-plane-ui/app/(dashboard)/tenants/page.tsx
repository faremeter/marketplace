"use client";

import { useAuth } from "@/lib/auth/context";
import useSWR from "swr";
import { api } from "@/lib/api/client";
import Link from "next/link";

interface Tenant {
  id: number;
  name: string;
  subdomain: string;
  status: string;
  created_at: string;
}

export default function TenantsPage() {
  const { currentOrg } = useAuth();

  const { data: tenants, isLoading } = useSWR(
    currentOrg ? `/api/organizations/${currentOrg.id}/tenants` : null,
    api.get<Tenant[]>,
  );

  if (!currentOrg) {
    return (
      <div className="rounded-lg border border-gray-6 bg-gray-2 p-6">
        <h2 className="mb-2 text-lg font-medium text-gray-12">
          No Organization Selected
        </h2>
        <p className="text-sm text-gray-11">
          Select an organization from the sidebar to view tenants.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-12">Tenants</h1>
          <p className="text-sm text-gray-11">
            Manage tenants for {currentOrg.name}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-6 border-t-accent-9" />
        </div>
      ) : tenants?.length ? (
        <div className="overflow-hidden rounded-lg border border-gray-6">
          <table className="w-full">
            <thead className="bg-gray-3">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                  Subdomain
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-6 bg-gray-2">
              {tenants.map((tenant) => (
                <tr key={tenant.id} className="hover:bg-gray-3">
                  <td className="px-4 py-3">
                    <Link
                      href={`/tenants/${tenant.id}`}
                      className="text-sm font-medium text-accent-11 hover:underline"
                    >
                      {tenant.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-11">
                    {tenant.subdomain}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={tenant.status} />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-11">
                    {new Date(tenant.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-6 bg-gray-2 p-6 text-center">
          <p className="text-sm text-gray-11">No tenants found.</p>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-green-900/50 text-green-400 border-green-800",
    pending: "bg-yellow-900/50 text-yellow-400 border-yellow-800",
    inactive: "bg-gray-800/50 text-gray-400 border-gray-700",
  };

  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${colors[status] ?? colors.inactive}`}
    >
      {status}
    </span>
  );
}
