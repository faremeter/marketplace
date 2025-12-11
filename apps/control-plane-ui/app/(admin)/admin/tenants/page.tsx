"use client";

import { useState } from "react";
import useSWR from "swr";
import { PlusIcon } from "@radix-ui/react-icons";
import { api } from "@/lib/api/client";
import { CreateTenantDialog } from "@/components/admin/create-tenant-dialog";
import { InlineOrgSelect } from "@/components/admin/inline-org-select";
import { InlineActiveToggle } from "@/components/admin/inline-active-toggle";
import { InlineAuthEdit } from "@/components/admin/inline-auth-edit";
import { InlineUrlEdit } from "@/components/admin/inline-url-edit";
import { InlineNodeSelect } from "@/components/admin/inline-node-select";

interface TenantNode {
  id: number;
  name: string;
  cert_status: string | null;
  is_primary: boolean;
}

interface Tenant {
  id: number;
  name: string;
  backend_url: string;
  is_active: boolean;
  organization_id: number | null;
  organization_name?: string;
  upstream_auth_header: string | null;
  upstream_auth_value: string | null;
  nodes: TenantNode[];
  created_at: string;
}

export default function AdminTenantsPage() {
  const {
    data: tenants,
    isLoading,
    mutate,
  } = useSWR("/api/admin/tenants", api.get<Tenant[]>, {
    refreshInterval: 3000,
  });
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-12">Tenants</h1>
          <p className="text-sm text-gray-11">
            Manage all tenants in the system
          </p>
        </div>
        <button
          onClick={() => setDialogOpen(true)}
          className="flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium text-black shadow-button transition-colors hover:bg-white/90"
        >
          <PlusIcon className="h-4 w-4" />
          New Tenant
        </button>
      </div>

      <CreateTenantDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => mutate()}
      />

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
                  ID
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                  Nodes
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                  Backend URL
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                  Organization
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                  Auth
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                  Active
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-6 bg-gray-2">
              {tenants.map((tenant) => (
                <tr key={tenant.id} className="hover:bg-gray-3">
                  <td className="px-4 py-3 text-sm text-gray-11">
                    {tenant.id}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-12">
                    {tenant.name}
                  </td>
                  <td className="px-4 py-3">
                    <InlineNodeSelect
                      tenantId={tenant.id}
                      tenantName={tenant.name}
                      nodes={tenant.nodes}
                      onUpdate={() => mutate()}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <InlineUrlEdit
                      tenantId={tenant.id}
                      tenantName={tenant.name}
                      backendUrl={tenant.backend_url}
                      onUpdate={() => mutate()}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <InlineOrgSelect
                      tenantId={tenant.id}
                      tenantName={tenant.name}
                      currentOrgId={tenant.organization_id}
                      currentOrgName={tenant.organization_name ?? null}
                      onUpdate={() => mutate()}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <InlineAuthEdit
                      tenantId={tenant.id}
                      tenantName={tenant.name}
                      authHeader={tenant.upstream_auth_header}
                      authValue={tenant.upstream_auth_value}
                      onUpdate={() => mutate()}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <InlineActiveToggle
                      tenantId={tenant.id}
                      tenantName={tenant.name}
                      isActive={tenant.is_active}
                      onUpdate={() => mutate()}
                    />
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
