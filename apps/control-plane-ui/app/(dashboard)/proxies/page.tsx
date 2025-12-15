"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/context";
import useSWR from "swr";
import { api } from "@/lib/api/client";
import Link from "next/link";
import { PlusIcon } from "@radix-ui/react-icons";
import { InlineUrlEdit } from "@/components/shared/inline-url-edit";
import { InlineAuthEdit } from "@/components/shared/inline-auth-edit";
import { InlineActiveToggle } from "@/components/shared/inline-active-toggle";
import { CreateUserTenantDialog } from "@/components/tenants/create-user-tenant-dialog";

interface TenantNode {
  id: number;
  cert_status: string | null;
  is_primary: boolean;
}

interface Tenant {
  id: number;
  name: string;
  backend_url: string;
  is_active: boolean;
  wallet_status: string;
  upstream_auth_header: string | null;
  upstream_auth_value: string | null;
  nodes: TenantNode[];
  created_at: string;
}

function getStatus(tenant: Tenant): {
  label: string;
  color: string;
} {
  if (tenant.nodes.length === 0) {
    return {
      label: "Pending",
      color: "bg-gray-800/50 text-gray-400 border-gray-700",
    };
  }

  const hasPendingCert = tenant.nodes.some((n) => n.cert_status === "pending");
  const hasFailedCert = tenant.nodes.some((n) => n.cert_status === "failed");
  const allProvisioned = tenant.nodes.every(
    (n) => n.cert_status === "provisioned",
  );

  if (hasFailedCert) {
    return {
      label: "Failed",
      color: "bg-red-900/50 text-red-400 border-red-800",
    };
  }
  if (hasPendingCert) {
    return {
      label: "Provisioning",
      color: "bg-yellow-900/50 text-yellow-400 border-yellow-800",
    };
  }
  if (tenant.wallet_status === "pending") {
    return {
      label: "Funding",
      color: "bg-yellow-900/50 text-yellow-400 border-yellow-800",
    };
  }
  if (tenant.wallet_status === "failed") {
    return {
      label: "Failed",
      color: "bg-red-900/50 text-red-400 border-red-800",
    };
  }
  if (allProvisioned && tenant.wallet_status === "funded") {
    return {
      label: "Ready",
      color: "bg-green-900/50 text-green-400 border-green-800",
    };
  }

  return {
    label: "Pending",
    color: "bg-gray-800/50 text-gray-400 border-gray-700",
  };
}

export default function TenantsPage() {
  const { currentOrg } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const {
    data: tenants,
    isLoading,
    mutate,
  } = useSWR(
    currentOrg ? `/api/organizations/${currentOrg.id}/tenants` : null,
    api.get<Tenant[]>,
    { refreshInterval: 3000 },
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
          <h1 className="text-2xl font-semibold text-gray-12">Proxies</h1>
          <p className="text-sm text-gray-11">
            Manage x402 proxies for {currentOrg.name}
          </p>
        </div>
        <button
          onClick={() => setIsDialogOpen(true)}
          className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium text-black shadow-button transition-colors hover:bg-white/90"
        >
          <PlusIcon className="h-4 w-4" />
          New Proxy
        </button>
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
                  ID
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                  Backend URL
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                  Auth
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                  Active
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
              {tenants.map((tenant) => {
                const status = getStatus(tenant);
                const apiEndpoint = `/api/organizations/${currentOrg.id}/tenants/${tenant.id}`;
                return (
                  <tr key={tenant.id} className="hover:bg-gray-3">
                    <td className="px-4 py-3 text-sm text-gray-11">
                      {tenant.id}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/proxies/${tenant.id}`}
                        className="text-sm font-medium text-accent-11 hover:underline"
                      >
                        {tenant.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <InlineUrlEdit
                        tenantId={tenant.id}
                        tenantName={tenant.name}
                        backendUrl={tenant.backend_url}
                        onUpdate={() => mutate()}
                        apiEndpoint={apiEndpoint}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <InlineAuthEdit
                        tenantId={tenant.id}
                        tenantName={tenant.name}
                        authHeader={tenant.upstream_auth_header}
                        authValue={tenant.upstream_auth_value}
                        onUpdate={() => mutate()}
                        apiEndpoint={apiEndpoint}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <InlineActiveToggle
                        tenantId={tenant.id}
                        tenantName={tenant.name}
                        isActive={tenant.is_active}
                        onUpdate={() => mutate()}
                        apiEndpoint={apiEndpoint}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${status.color}`}
                      >
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-11">
                      {new Date(tenant.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-6 bg-gray-2 p-6 text-center">
          <p className="text-sm text-gray-11">No proxies found.</p>
          <button
            onClick={() => setIsDialogOpen(true)}
            className="mt-3 inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium text-black shadow-button transition-colors hover:bg-white/90"
          >
            <PlusIcon className="h-4 w-4" />
            Create your first proxy
          </button>
        </div>
      )}

      <CreateUserTenantDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSuccess={() => mutate()}
        organizationId={currentOrg.id}
      />
    </div>
  );
}
