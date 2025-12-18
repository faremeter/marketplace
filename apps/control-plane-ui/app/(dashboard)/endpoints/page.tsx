"use client";

import { useAuth } from "@/lib/auth/context";
import useSWR from "swr";
import * as Tooltip from "@radix-ui/react-tooltip";
import { api } from "@/lib/api/client";
import { InlineActiveToggle } from "@/components/shared/inline-active-toggle";
import { InlinePriceEdit } from "@/components/shared/inline-price-edit";
import { InlineSchemeEdit } from "@/components/shared/inline-scheme-edit";
import Link from "next/link";
import { Pencil1Icon } from "@radix-ui/react-icons";

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
  path: string | null;
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
  const {
    data: endpoints,
    isLoading,
    mutate: mutateEndpoints,
  } = useSWR(`/api/tenants/${tenant.id}/endpoints`, api.get<Endpoint[]>, {
    refreshInterval: 5000,
  });

  const apiEndpoint = `/api/organizations/${orgId}/tenants/${tenant.id}`;

  return (
    <div className="overflow-hidden rounded-lg border border-gray-6 bg-gray-2">
      <div className="flex items-center justify-between border-b border-gray-6 bg-gray-3 px-4 py-3">
        <div className="flex items-center gap-4">
          <Link
            href={`/proxies/${tenant.id}`}
            className="text-lg font-medium text-gray-12 hover:text-accent-11 hover:underline"
          >
            {tenant.name}
          </Link>
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
          {tenant.status === "active" ? (
            <InlineActiveToggle
              tenantId={tenant.id}
              tenantName={tenant.name}
              isActive={tenant.is_active}
              onUpdate={onUpdate}
              apiEndpoint={apiEndpoint}
            />
          ) : (
            <TenantStatusBadge status={tenant.status} />
          )}
          <Link
            href={`/proxies/${tenant.id}?tab=endpoints`}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-6 bg-gray-4 px-2.5 py-1 text-xs font-medium text-gray-11 hover:bg-gray-5 hover:text-gray-12"
          >
            <Pencil1Icon className="h-3.5 w-3.5" />
            Edit
          </Link>
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
                <th className="w-full pb-2 text-left text-xs font-medium text-gray-11">
                  Path
                </th>
                <th className="whitespace-nowrap pb-2 pr-4 text-right text-xs font-medium text-gray-11">
                  Price
                </th>
                <th className="whitespace-nowrap pb-2 text-right text-xs font-medium text-gray-11">
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
                <td className="whitespace-nowrap py-2 pl-4 pr-4 text-right align-middle">
                  <div className="flex items-center justify-end gap-2">
                    <InlinePriceEdit
                      priceUsdc={tenant.default_price_usdc}
                      onUpdate={onUpdate}
                      apiEndpoint={apiEndpoint}
                      fieldName="default_price_usdc"
                      label="Default Price"
                    />
                    {tenant.default_price_usdc === 0 && (
                      <span className="rounded bg-green-900/50 px-1.5 py-0.5 text-[10px] font-medium text-green-400 border border-green-800">
                        Free
                      </span>
                    )}
                  </div>
                </td>
                <td className="whitespace-nowrap py-2 pl-4 text-right align-middle">
                  <InlineSchemeEdit
                    scheme={tenant.default_scheme}
                    onUpdate={onUpdate}
                    apiEndpoint={apiEndpoint}
                    fieldName="default_scheme"
                    label="Default Scheme"
                  />
                </td>
              </tr>
              {endpoints?.map((endpoint) => (
                <tr key={endpoint.id} className="bg-gray-3/50">
                  <td className="py-2 align-middle">
                    <code className="rounded bg-accent-4 px-1.5 py-0.5 text-xs text-accent-11">
                      {endpoint.path ?? endpoint.path_pattern}
                    </code>
                  </td>
                  <td className="whitespace-nowrap py-2 pl-4 pr-4 text-right align-middle">
                    <div className="flex items-center justify-end gap-2">
                      <InlinePriceEdit
                        priceUsdc={
                          endpoint.price_usdc ?? tenant.default_price_usdc
                        }
                        defaultPriceUsdc={tenant.default_price_usdc}
                        onUpdate={() => mutateEndpoints()}
                        apiEndpoint={`/api/tenants/${tenant.id}/endpoints/${endpoint.id}`}
                        fieldName="price_usdc"
                        label="Price"
                      />
                      {(endpoint.price_usdc ?? tenant.default_price_usdc) ===
                        0 && (
                        <span className="rounded bg-green-900/50 px-1.5 py-0.5 text-[10px] font-medium text-green-400 border border-green-800">
                          Free
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap py-2 pl-4 text-right align-middle">
                    <InlineSchemeEdit
                      scheme={endpoint.scheme ?? tenant.default_scheme}
                      defaultScheme={tenant.default_scheme}
                      onUpdate={() => mutateEndpoints()}
                      apiEndpoint={`/api/tenants/${tenant.id}/endpoints/${endpoint.id}`}
                      fieldName="scheme"
                      label="Scheme"
                    />
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
    failed: {
      className: "border-yellow-800 bg-yellow-900/50 text-yellow-400",
      label: "Pending",
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
