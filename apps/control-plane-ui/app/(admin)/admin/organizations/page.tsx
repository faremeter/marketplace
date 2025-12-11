"use client";

import useSWR from "swr";
import { api } from "@/lib/api/client";

interface Organization {
  id: number;
  name: string;
  slug: string;
  is_admin: boolean;
  created_at: string;
  member_count?: number;
  tenant_count?: number;
}

export default function AdminOrganizationsPage() {
  const { data: organizations, isLoading } = useSWR(
    "/api/admin/organizations",
    api.get<Organization[]>,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-12">Organizations</h1>
        <p className="text-sm text-gray-11">Manage all organizations</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-6 border-t-accent-9" />
        </div>
      ) : organizations?.length ? (
        <div className="overflow-hidden rounded-lg border border-gray-6">
          <table className="w-full">
            <thead className="bg-gray-3">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                  ID
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                  Slug
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                  Members
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                  Tenants
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-6 bg-gray-2">
              {organizations.map((org) => (
                <tr key={org.id} className="hover:bg-gray-3">
                  <td className="px-4 py-3 text-sm text-gray-11">{org.id}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-12">
                    <span className="flex items-center gap-2">
                      {org.name}
                      {org.is_admin && (
                        <span className="rounded-full border border-amber-800 bg-amber-900/50 px-2 py-0.5 text-xs text-amber-400">
                          Admin
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <code className="rounded bg-gray-4 px-2 py-1 text-xs text-gray-11">
                      {org.slug}
                    </code>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-11">
                    {org.member_count ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-11">
                    {org.tenant_count ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-11">
                    {new Date(org.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-6 bg-gray-2 p-6 text-center">
          <p className="text-sm text-gray-11">No organizations found.</p>
        </div>
      )}
    </div>
  );
}
