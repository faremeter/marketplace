"use client";

import { useAuth } from "@/lib/auth/context";
import useSWR from "swr";
import { api } from "@/lib/api/client";
import { InlinePriceEdit } from "@/components/shared/inline-price-edit";
import { InlineSchemeEdit } from "@/components/shared/inline-scheme-edit";
import Link from "next/link";
import {
  Pencil1Icon,
  CopyIcon,
  CheckIcon,
  EyeOpenIcon,
} from "@radix-ui/react-icons";
import { useState } from "react";
import { useToast } from "@/components/ui/toast";

interface Tenant {
  id: number;
  name: string;
  is_active: boolean;
  status: string;
  wallet_id: number | null;
  wallet_funding_status: string | null;
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
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const {
    data: endpoints,
    isLoading,
    mutate: mutateEndpoints,
  } = useSWR(`/api/tenants/${tenant.id}/endpoints`, api.get<Endpoint[]>, {
    refreshInterval: 5000,
  });

  const apiEndpoint = `/api/organizations/${orgId}/tenants/${tenant.id}`;
  const proxyUrl = `https://${tenant.name}.api.corbits.dev`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(proxyUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "URL copied to clipboard" });
  };

  return (
    <div className="overflow-hidden rounded-lg border border-gray-6 bg-gray-2">
      <div className="flex items-center justify-between border-b border-gray-6 bg-gray-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <Link
            href={`/proxies/${tenant.id}`}
            className="text-lg font-medium text-gray-12 hover:text-accent-11 hover:underline"
          >
            {tenant.name}
          </Link>
          <div className="flex items-center rounded-lg border border-gray-6 bg-gray-3/50">
            <div className="flex items-center gap-2 px-3 py-1.5">
              <div
                className={`h-2 w-2 rounded-full ${
                  tenant.status === "active" &&
                  tenant.is_active &&
                  tenant.wallet_id &&
                  tenant.wallet_funding_status === "funded"
                    ? "bg-green-500 animate-pulse"
                    : tenant.status === "pending"
                      ? "bg-yellow-500 animate-pulse"
                      : tenant.status === "failed" ||
                          tenant.status === "deleting" ||
                          !tenant.wallet_id
                        ? "bg-red-500"
                        : "bg-gray-500"
                }`}
              />
              <code className="text-sm text-gray-11">{proxyUrl}</code>
            </div>
            <button
              onClick={handleCopy}
              className="border-l border-gray-6 px-2 py-1.5 text-gray-11 hover:bg-gray-4 hover:text-gray-12 transition-colors rounded-r-lg"
              title="Copy URL"
            >
              {copied ? (
                <CheckIcon className="h-3.5 w-3.5 text-green-400" />
              ) : (
                <CopyIcon className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/proxies/${tenant.id}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-6 bg-gray-4 px-2.5 py-1 text-xs font-medium text-gray-11 hover:bg-gray-5 hover:text-gray-12"
          >
            <EyeOpenIcon className="h-3.5 w-3.5" />
            View
          </Link>
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
