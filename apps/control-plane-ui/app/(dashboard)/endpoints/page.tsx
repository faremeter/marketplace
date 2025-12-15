"use client";

import { useAuth } from "@/lib/auth/context";
import useSWR from "swr";
import * as Tooltip from "@radix-ui/react-tooltip";
import { api } from "@/lib/api/client";
import { InlineActiveToggle } from "@/components/shared/inline-active-toggle";

interface Tenant {
  id: number;
  name: string;
  backend_url: string;
  is_active: boolean;
  status: string;
  default_price_usdc: number;
  default_scheme: string;
}

interface Endpoint {
  id: number;
  path_pattern: string;
  price_usdc: number | null;
  scheme: string | null;
  description: string | null;
  created_at: string;
}

export default function EndpointsPage() {
  const { currentOrg } = useAuth();

  const {
    data: tenants,
    isLoading,
    mutate,
  } = useSWR(
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
          Select an organization from the sidebar to view endpoints.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-12">Endpoints</h1>
        <p className="text-sm text-gray-11">
          API endpoints for {currentOrg.name}
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-6 border-t-accent-9" />
        </div>
      ) : tenants?.length ? (
        <div className="space-y-6">
          {tenants.map((tenant) => (
            <TenantCard
              key={tenant.id}
              tenant={tenant}
              orgId={currentOrg.id}
              onUpdate={() => mutate()}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-gray-6 bg-gray-2 p-6 text-center">
          <p className="text-sm text-gray-11">No proxies found.</p>
        </div>
      )}
    </div>
  );
}

function TenantCard({
  tenant,
  orgId,
  onUpdate,
}: {
  tenant: Tenant;
  orgId: number;
  onUpdate: () => void;
}) {
  const { data: endpoints, isLoading } = useSWR(
    `/api/tenants/${tenant.id}/endpoints`,
    api.get<Endpoint[]>,
    { refreshInterval: 5000 },
  );

  const apiEndpoint = `/api/organizations/${orgId}/tenants/${tenant.id}`;

  return (
    <div className="overflow-hidden rounded-lg border border-gray-6 bg-gray-2">
      <div className="flex items-center justify-between border-b border-gray-6 bg-gray-3 px-4 py-3">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-medium text-gray-12">{tenant.name}</h2>
          <Tooltip.Provider delayDuration={200}>
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <code className="cursor-default rounded bg-gray-4 px-2 py-1 text-xs text-gray-11">
                  {tenant.backend_url.length > 50
                    ? `${tenant.backend_url.slice(0, 50)}...`
                    : tenant.backend_url}
                </code>
              </Tooltip.Trigger>
              {tenant.backend_url.length > 50 && (
                <Tooltip.Portal>
                  <Tooltip.Content
                    className="rounded bg-gray-12 px-2 py-1 text-xs text-gray-1"
                    sideOffset={5}
                  >
                    {tenant.backend_url}
                    <Tooltip.Arrow className="fill-gray-12" />
                  </Tooltip.Content>
                </Tooltip.Portal>
              )}
            </Tooltip.Root>
          </Tooltip.Provider>
        </div>
        <div className="flex items-center gap-3">
          <InlineActiveToggle
            tenantId={tenant.id}
            tenantName={tenant.name}
            isActive={tenant.is_active}
            onUpdate={onUpdate}
            apiEndpoint={apiEndpoint}
          />
          <TenantStatusBadge status={tenant.status} />
        </div>
      </div>

      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-6 border-t-accent-9" />
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-6">
                <th className="pb-2 text-left text-xs font-medium text-gray-11">
                  Path
                </th>
                <th className="pb-2 text-left text-xs font-medium text-gray-11">
                  Price
                </th>
                <th className="pb-2 text-left text-xs font-medium text-gray-11">
                  Scheme
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-6">
              <tr className="bg-gray-3/50">
                <td className="py-2 align-middle">
                  <code className="rounded bg-accent-4 px-1.5 py-0.5 text-xs text-accent-11">
                    /
                  </code>
                  <span className="ml-2 text-xs text-gray-11">(catch-all)</span>
                </td>
                <td className="py-2 align-middle text-sm text-gray-11">
                  ${(Number(tenant.default_price_usdc) / 1_000_000).toFixed(3)}{" "}
                  USDC
                </td>
                <td className="py-2 align-middle text-sm text-gray-11">
                  {tenant.default_scheme}
                </td>
              </tr>
              {endpoints?.map((endpoint) => (
                <tr key={endpoint.id}>
                  <td className="py-2 align-middle">
                    <code className="rounded bg-gray-4 px-1.5 py-0.5 text-xs text-gray-11">
                      {endpoint.path_pattern}
                    </code>
                  </td>
                  <td className="py-2 align-middle text-sm text-gray-11">
                    {endpoint.price_usdc !== null
                      ? `$${(Number(endpoint.price_usdc) / 1_000_000).toFixed(3)} USDC`
                      : "-"}
                  </td>
                  <td className="py-2 align-middle text-sm text-gray-11">
                    {endpoint.scheme ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function TenantStatusBadge({ status }: { status: string }) {
  const config: Record<
    string,
    { className: string; label: string; pulse: boolean }
  > = {
    pending: {
      className: "border-yellow-800 bg-yellow-900/50 text-yellow-400",
      label: "Pending",
      pulse: true,
    },
    active: {
      className: "border-green-800 bg-green-900/50 text-green-400",
      label: "Ready",
      pulse: false,
    },
    deleting: {
      className: "border-red-800 bg-red-900/50 text-red-400",
      label: "Deleting",
      pulse: true,
    },
  };

  const { className, label, pulse } = config[status] ?? config.pending;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${className} ${pulse ? "animate-pulse" : ""}`}
    >
      {label}
    </span>
  );
}
