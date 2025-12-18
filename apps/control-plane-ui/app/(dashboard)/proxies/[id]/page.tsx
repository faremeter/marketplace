"use client";

import { useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/context";
import useSWR from "swr";
import { api } from "@/lib/api/client";
import Link from "next/link";
import { ChevronLeftIcon, CopyIcon, CheckIcon } from "@radix-ui/react-icons";
import { useToast } from "@/components/ui/toast";
import { InlineUrlEdit } from "@/components/shared/inline-url-edit";
import { InlineActiveToggle } from "@/components/shared/inline-active-toggle";
import { InlineAuthEdit } from "@/components/shared/inline-auth-edit";
import { InlinePriceEdit } from "@/components/shared/inline-price-edit";
import { InlineSchemeEdit } from "@/components/shared/inline-scheme-edit";
import { EndpointsTab } from "@/components/proxy-endpoints/endpoints-tab";

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
  status: string;
  wallet_id: number | null;
  wallet_funding_status: string | null;
  default_price_usdc: number;
  default_scheme: string;
  upstream_auth_header: string | null;
  upstream_auth_value: string | null;
  nodes: TenantNode[];
  created_at: string;
}

interface OpenApiSpecResponse {
  spec: unknown | null;
  hasSpec: boolean;
}

function getStatus(tenant: Tenant): {
  label: string;
  color: string;
} {
  if (tenant.status === "deleting") {
    return {
      label: "Deleting",
      color: "bg-red-900/50 text-red-400 border-red-800",
    };
  }

  if (tenant.status === "failed") {
    return {
      label: "Pending",
      color: "bg-yellow-900/50 text-yellow-400 border-yellow-800",
    };
  }

  if (tenant.status === "pending") {
    const hasPendingCert = tenant.nodes.some(
      (n) => n.cert_status === "pending",
    );

    if (tenant.wallet_funding_status === "pending") {
      return {
        label: "Funding",
        color: "bg-yellow-900/50 text-yellow-400 border-yellow-800",
      };
    }

    if (hasPendingCert) {
      return {
        label: "Provisioning",
        color: "bg-yellow-900/50 text-yellow-400 border-yellow-800",
      };
    }

    return {
      label: "Initializing",
      color: "bg-yellow-900/50 text-yellow-400 border-yellow-800",
    };
  }

  return {
    label: "Ready",
    color: "bg-green-900/50 text-green-400 border-green-800",
  };
}

type TabType = "overview" | "endpoints";

export default function ProxyDetailPage() {
  const params = useParams();
  const tenantId = parseInt(params.id as string);
  const { currentOrg } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get("tab");
  const activeTab: TabType =
    tabParam === "endpoints" ? "endpoints" : "overview";
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const setActiveTab = (tab: TabType) => {
    router.push(`/proxies/${tenantId}?tab=${tab}`);
  };

  const {
    data: tenants,
    isLoading: tenantsLoading,
    mutate: mutateTenants,
  } = useSWR(
    currentOrg ? `/api/organizations/${currentOrg.id}/tenants` : null,
    api.get<Tenant[]>,
    { refreshInterval: 5000 },
  );

  const { data: specData, mutate: mutateSpec } = useSWR(
    tenantId ? `/api/tenants/${tenantId}/openapi/spec` : null,
    api.get<OpenApiSpecResponse>,
  );

  const tenant = tenants?.find((t) => t.id === tenantId);

  if (!currentOrg) {
    return (
      <div className="rounded-lg border border-gray-6 bg-gray-2 p-6">
        <h2 className="mb-2 text-lg font-medium text-gray-12">
          No Organization Selected
        </h2>
        <p className="text-sm text-gray-11">
          Select an organization from the sidebar to view proxy details.
        </p>
      </div>
    );
  }

  if (tenantsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-6 border-t-accent-9" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="rounded-lg border border-gray-6 bg-gray-2 p-6">
        <h2 className="mb-2 text-lg font-medium text-gray-12">
          Proxy Not Found
        </h2>
        <p className="text-sm text-gray-11">
          The proxy you are looking for does not exist or you do not have
          permission to view it.
        </p>
        <Link
          href="/proxies"
          className="mt-4 inline-flex items-center gap-1 text-sm text-accent-11 hover:underline"
        >
          <ChevronLeftIcon className="h-4 w-4" />
          Back to Proxies
        </Link>
      </div>
    );
  }

  const status = getStatus(tenant);
  const apiEndpoint = `/api/organizations/${currentOrg.id}/tenants/${tenant.id}`;

  const tabs: { id: TabType; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "endpoints", label: "Endpoints" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-11">
        <Link href="/proxies" className="hover:text-gray-12">
          Proxies
        </Link>
        <span>/</span>
        <span className="text-gray-12">{tenant.name}</span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold text-gray-12">{tenant.name}</h1>
          <div className="flex items-center rounded-lg border border-gray-6 bg-gray-3/50">
            <div className="flex items-center gap-2 px-3 py-1.5">
              <div
                className={`h-2 w-2 rounded-full ${
                  tenant.status === "active" && tenant.is_active
                    ? "bg-green-500 animate-pulse"
                    : tenant.status === "pending"
                      ? "bg-yellow-500 animate-pulse"
                      : "bg-gray-500"
                }`}
              />
              <code className="text-sm text-gray-11">
                https://{tenant.name}.api.corbits.dev
              </code>
            </div>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(
                  `https://${tenant.name}.api.corbits.dev`,
                );
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
                toast({ title: "URL copied to clipboard" });
              }}
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
        <div className="flex items-center gap-3">
          {status.label !== "Ready" && (
            <span
              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${status.color}`}
            >
              {status.label}
            </span>
          )}
          <InlineActiveToggle
            tenantId={tenant.id}
            tenantName={tenant.name}
            isActive={tenant.is_active}
            onUpdate={() => mutateTenants()}
            apiEndpoint={apiEndpoint}
          />
        </div>
      </div>

      <div className="border-b border-gray-6">
        <nav className="-mb-px flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-accent-9 text-gray-12"
                  : "border-transparent text-gray-11 hover:border-gray-6 hover:text-gray-12"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div>
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="rounded-lg border border-gray-6 bg-gray-2 p-6">
              <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-gray-11">
                Proxy Information
              </h3>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-gray-11">Status</dt>
                  <dd className="mt-1">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${status.color}`}
                    >
                      {status.label}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-11">Active</dt>
                  <dd className="mt-1">
                    <InlineActiveToggle
                      tenantId={tenant.id}
                      tenantName={tenant.name}
                      isActive={tenant.is_active}
                      onUpdate={() => mutateTenants()}
                      apiEndpoint={apiEndpoint}
                    />
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-11">Backend URL</dt>
                  <dd className="mt-1">
                    <InlineUrlEdit
                      tenantId={tenant.id}
                      tenantName={tenant.name}
                      backendUrl={tenant.backend_url}
                      onUpdate={() => mutateTenants()}
                      apiEndpoint={apiEndpoint}
                    />
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-11">Backend Auth Header</dt>
                  <dd className="mt-1">
                    <InlineAuthEdit
                      tenantId={tenant.id}
                      tenantName={tenant.name}
                      authHeader={tenant.upstream_auth_header}
                      authValue={tenant.upstream_auth_value}
                      onUpdate={() => mutateTenants()}
                      apiEndpoint={apiEndpoint}
                    />
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-11">Default Price</dt>
                  <dd className="mt-1">
                    <InlinePriceEdit
                      priceUsdc={tenant.default_price_usdc}
                      onUpdate={() => mutateTenants()}
                      apiEndpoint={apiEndpoint}
                    />
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-11">Default Scheme</dt>
                  <dd className="mt-1">
                    <InlineSchemeEdit
                      scheme={tenant.default_scheme}
                      onUpdate={() => mutateTenants()}
                      apiEndpoint={apiEndpoint}
                    />
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        )}

        {activeTab === "endpoints" && (
          <EndpointsTab
            tenantId={tenantId}
            orgId={currentOrg.id}
            defaultPriceUsdc={tenant.default_price_usdc}
            defaultScheme={tenant.default_scheme}
            hasOpenApiSpec={specData?.hasSpec ?? false}
            onSpecChange={() => mutateSpec()}
            onDefaultsChange={() => mutateTenants()}
          />
        )}
      </div>
    </div>
  );
}
