"use client";

import { useState, useMemo } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/context";
import useSWR from "swr";
import { api } from "@/lib/api/client";
import Link from "next/link";
import {
  ChevronLeftIcon,
  CopyIcon,
  CheckIcon,
  ExternalLinkIcon,
} from "@radix-ui/react-icons";
import * as Tabs from "@radix-ui/react-tabs";
import * as RadixTooltip from "@radix-ui/react-tooltip";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  type EarningsAnalytics,
  formatUSDC,
  getValueColor,
  getChangeColor,
  formatChange,
} from "@/lib/analytics";
import { useToast } from "@/components/ui/toast";
import { InlineUrlEdit } from "@/components/shared/inline-url-edit";
import { InlineActiveToggle } from "@/components/shared/inline-active-toggle";
import { InlineAuthEdit } from "@/components/shared/inline-auth-edit";
import { InlinePriceEdit } from "@/components/shared/inline-price-edit";
import { InlineSchemeEdit } from "@/components/shared/inline-scheme-edit";
import { InlineWalletSelect } from "@/components/shared/inline-wallet-select";
import { EndpointsTab } from "@/components/proxy-endpoints/endpoints-tab";
import { getProxyUrl } from "@/lib/format";

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
  wallet_name: string | null;
  wallet_funding_status: string | null;
  default_price_usdc: number;
  default_scheme: string;
  upstream_auth_header: string | null;
  upstream_auth_value: string | null;
  org_slug?: string | null;
  nodes: TenantNode[];
  created_at: string;
}

interface OpenApiSpecResponse {
  spec: unknown | null;
  hasSpec: boolean;
}

interface DailyCallData {
  period: string;
  total_usdc: number;
  call_count: number;
}

function getStatus(tenant: Tenant): {
  label: string;
  color: string;
  tooltip: string;
} {
  if (tenant.status === "deleting") {
    return {
      label: "Deleting",
      color: "bg-red-900/50 text-red-400 border-red-800",
      tooltip: "This proxy is being deleted",
    };
  }

  if (tenant.status === "failed") {
    return {
      label: "Pending",
      color: "bg-yellow-900/50 text-yellow-400 border-yellow-800",
      tooltip: "Proxy setup failed, retrying",
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
        tooltip: "Waiting for wallet funding to complete",
      };
    }

    if (hasPendingCert) {
      return {
        label: "Provisioning",
        color: "bg-yellow-900/50 text-yellow-400 border-yellow-800",
        tooltip: "SSL certificate is being provisioned",
      };
    }

    return {
      label: "Initializing",
      color: "bg-yellow-900/50 text-yellow-400 border-yellow-800",
      tooltip: "Proxy is being initialized",
    };
  }

  if (!tenant.wallet_id) {
    return {
      label: "No Wallet",
      color: "bg-red-900/50 text-red-400 border-red-800",
      tooltip: "Assign a wallet to enable this proxy",
    };
  }

  if (tenant.wallet_funding_status !== "funded") {
    return {
      label: "Unfunded",
      color: "bg-yellow-900/50 text-yellow-400 border-yellow-800",
      tooltip: "Wallet needs funding to process payments",
    };
  }

  if (!tenant.is_active) {
    return {
      label: "Inactive",
      color: "bg-gray-800/50 text-gray-400 border-gray-700",
      tooltip: "Proxy is disabled, enable it in settings",
    };
  }

  return {
    label: "Ready",
    color: "bg-green-900/50 text-green-400 border-green-800",
    tooltip: "Proxy is live and accepting requests",
  };
}

type TabType = "overview" | "endpoints" | "settings";

export default function ProxyDetailPage() {
  const params = useParams();
  const tenantId = parseInt(params.id as string);
  const { currentOrg } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get("tab");
  const activeTab: TabType =
    tabParam === "endpoints"
      ? "endpoints"
      : tabParam === "settings"
        ? "settings"
        : "overview";
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

  const { data: dailyData } = useSWR(
    currentOrg && tenantId
      ? `/api/organizations/${currentOrg.id}/analytics/earnings?level=tenant&targetId=${tenantId}&granularity=day&periods=30`
      : null,
    api.get<DailyCallData[]>,
  );

  const { data: analytics } = useSWR(
    currentOrg && tenantId
      ? `/api/organizations/${currentOrg.id}/tenants/${tenantId}/analytics`
      : null,
    api.get<EarningsAnalytics>,
  );

  const chartData = useMemo(() => {
    if (!dailyData || !Array.isArray(dailyData)) return [];
    return dailyData.map((d) => ({
      date: d.period.slice(5),
      calls: d.call_count,
    }));
  }, [dailyData]);

  const revenueChartData = useMemo(() => {
    if (!dailyData || !Array.isArray(dailyData)) return [];
    return dailyData.map((d) => ({
      date: d.period.slice(5),
      revenue: d.total_usdc,
    }));
  }, [dailyData]);

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
    { id: "overview", label: "Analytics" },
    { id: "endpoints", label: "Endpoints" },
    { id: "settings", label: "Settings" },
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
              <code className="text-sm text-gray-11">
                {getProxyUrl({
                  proxyName: tenant.name,
                  orgSlug: tenant.org_slug,
                })}
              </code>
            </div>
            <button
              onClick={async () => {
                const proxyUrl = getProxyUrl({
                  proxyName: tenant.name,
                  orgSlug: tenant.org_slug,
                });
                await navigator.clipboard.writeText(proxyUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
                toast({ title: "URL copied to clipboard" });
              }}
              className="border-l border-gray-6 px-2 py-1.5 text-gray-11 hover:bg-gray-4 hover:text-gray-12 transition-colors"
              title="Copy URL"
            >
              {copied ? (
                <CheckIcon className="h-3.5 w-3.5 text-green-400" />
              ) : (
                <CopyIcon className="h-3.5 w-3.5" />
              )}
            </button>
            <a
              href={getProxyUrl({
                proxyName: tenant.name,
                orgSlug: tenant.org_slug,
              })}
              target="_blank"
              rel="noopener noreferrer"
              className="border-l border-gray-6 px-2 py-1.5 text-gray-11 hover:bg-gray-4 hover:text-gray-12 transition-colors rounded-r-lg"
              title="Open in new tab"
            >
              <ExternalLinkIcon className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
        <RadixTooltip.Provider>
          <RadixTooltip.Root>
            <RadixTooltip.Trigger asChild>
              <span
                className={`inline-flex cursor-help rounded-full border px-2.5 py-1 text-xs font-medium ${status.color}`}
              >
                {status.label}
              </span>
            </RadixTooltip.Trigger>
            <RadixTooltip.Portal>
              <RadixTooltip.Content
                className="rounded-md bg-gray-1 px-3 py-2 text-xs text-gray-11 shadow-lg border border-gray-6"
                sideOffset={5}
              >
                {status.tooltip}
                <RadixTooltip.Arrow className="fill-gray-1" />
              </RadixTooltip.Content>
            </RadixTooltip.Portal>
          </RadixTooltip.Root>
        </RadixTooltip.Provider>
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
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-gray-6 bg-gray-2 p-4">
                <p className="text-[12px] text-gray-9">Total Earned</p>
                <p
                  className={`mt-1 text-[15px] font-medium ${getValueColor(analytics?.total_earned_usdc)}`}
                >
                  {formatUSDC(analytics?.total_earned_usdc)}
                </p>
              </div>
              <div className="rounded-lg border border-gray-6 bg-gray-2 p-4">
                <p className="text-[12px] text-gray-9">This Month</p>
                <div className="mt-1 flex items-baseline gap-2">
                  <p
                    className={`text-[15px] font-medium ${getValueColor(analytics?.current_month_earned_usdc)}`}
                  >
                    {formatUSDC(analytics?.current_month_earned_usdc)}
                  </p>
                  {formatChange(analytics?.percent_change) !== "-" && (
                    <span
                      className={`text-[12px] font-medium ${getChangeColor(analytics?.percent_change)}`}
                    >
                      {formatChange(analytics?.percent_change)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <Tabs.Root
              defaultValue="revenue"
              className="rounded-lg border border-gray-6 bg-gray-2 p-6"
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-medium uppercase tracking-wider text-gray-11">
                  Activity{" "}
                  <span className="text-xs font-normal normal-case text-gray-9">
                    Last 30 Days
                  </span>
                </h3>
                <Tabs.List className="flex rounded-md bg-gray-4 p-0.5">
                  <Tabs.Trigger
                    value="revenue"
                    className="rounded px-3 py-1 text-xs font-medium text-gray-11 transition-colors data-[state=active]:bg-gray-6 data-[state=active]:text-white"
                  >
                    Revenue
                  </Tabs.Trigger>
                  <Tabs.Trigger
                    value="calls"
                    className="rounded px-3 py-1 text-xs font-medium text-gray-11 transition-colors data-[state=active]:bg-gray-6 data-[state=active]:text-white"
                  >
                    Calls
                  </Tabs.Trigger>
                </Tabs.List>
              </div>
              <Tabs.Content value="calls">
                <div className="h-48">
                  {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <XAxis
                          dataKey="date"
                          tick={{ fill: "#888", fontSize: 10 }}
                          tickLine={false}
                          axisLine={{ stroke: "#333" }}
                        />
                        <YAxis
                          tick={{ fill: "#888", fontSize: 10 }}
                          tickLine={false}
                          axisLine={{ stroke: "#333" }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1a1a1a",
                            border: "1px solid #333",
                            borderRadius: "6px",
                          }}
                          labelStyle={{ color: "#888" }}
                          cursor={{ fill: "rgba(234, 134, 42, 0.15)" }}
                        />
                        <Bar
                          dataKey="calls"
                          fill="#ea862a"
                          radius={[2, 2, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <p className="text-sm text-gray-9">No activity yet</p>
                    </div>
                  )}
                </div>
              </Tabs.Content>
              <Tabs.Content value="revenue">
                <div className="h-48">
                  {revenueChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={revenueChartData}>
                        <XAxis
                          dataKey="date"
                          tick={{ fill: "#888", fontSize: 10 }}
                          tickLine={false}
                          axisLine={{ stroke: "#333" }}
                        />
                        <YAxis
                          tick={{ fill: "#888", fontSize: 10 }}
                          tickLine={false}
                          axisLine={{ stroke: "#333" }}
                          tickFormatter={(value) => formatUSDC(value)}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1a1a1a",
                            border: "1px solid #333",
                            borderRadius: "6px",
                          }}
                          labelStyle={{ color: "#888" }}
                          formatter={(value) => [
                            formatUSDC(value as number),
                            "Revenue",
                          ]}
                          cursor={{ fill: "rgba(234, 134, 42, 0.15)" }}
                        />
                        <Bar
                          dataKey="revenue"
                          fill="#ea862a"
                          radius={[2, 2, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <p className="text-sm text-gray-9">No revenue yet</p>
                    </div>
                  )}
                </div>
              </Tabs.Content>
            </Tabs.Root>
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

        {activeTab === "settings" && (
          <div className="space-y-6">
            <div className="rounded-lg border border-gray-6 bg-gray-2 p-6">
              <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-gray-11">
                Proxy Settings
              </h3>
              <dl className="grid grid-cols-2 gap-4 text-sm">
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
                  <dt className="text-gray-11">Wallet</dt>
                  <dd className="mt-1">
                    <InlineWalletSelect
                      tenantName={tenant.name}
                      organizationId={currentOrg.id}
                      currentWalletId={tenant.wallet_id}
                      currentWalletName={tenant.wallet_name}
                      apiEndpoint={apiEndpoint}
                      onUpdate={() => mutateTenants()}
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
      </div>
    </div>
  );
}
