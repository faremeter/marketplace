"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { api } from "@/lib/api/client";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Cross2Icon,
  PieChartIcon,
  MagnifyingGlassIcon,
} from "@radix-ui/react-icons";
import {
  type EarningsAnalytics,
  formatUSDC,
  getValueColor,
  getChangeColor,
  formatChange,
} from "@/lib/analytics";

interface Organization {
  id: number;
  name: string;
  slug: string;
  tenant_count: number;
}

interface Tenant {
  id: number;
  name: string;
  organization_id: number;
  organization_name: string;
  status: string;
}

interface Endpoint {
  id: number;
  path: string | null;
  path_pattern: string;
}

export default function OrgAnalyticsPage() {
  const [search, setSearch] = useState("");

  const { data: organizations, isLoading: orgsLoading } = useSWR(
    "/api/admin/organizations",
    api.get<Organization[]>,
  );

  const { data: tenants, isLoading: tenantsLoading } = useSWR(
    "/api/admin/tenants",
    api.get<Tenant[]>,
  );

  const isLoading = orgsLoading || tenantsLoading;

  // Filter and group data based on search
  const filteredData = useMemo(() => {
    if (!organizations || !tenants) return [];

    const searchLower = search.toLowerCase();

    // Group tenants by org, filtering by search
    const result: { org: Organization; tenants: Tenant[] }[] = [];

    for (const org of organizations) {
      const orgTenants = tenants.filter((t) => t.organization_id === org.id);

      if (search) {
        // If org name matches, include all its tenants
        if (org.name.toLowerCase().includes(searchLower)) {
          if (orgTenants.length > 0) {
            result.push({ org, tenants: orgTenants });
          }
        } else {
          // Otherwise, only include tenants that match
          const matchingTenants = orgTenants.filter((t) =>
            t.name.toLowerCase().includes(searchLower),
          );
          if (matchingTenants.length > 0) {
            result.push({ org, tenants: matchingTenants });
          }
        }
      } else {
        if (orgTenants.length > 0) {
          result.push({ org, tenants: orgTenants });
        }
      }
    }

    return result;
  }, [organizations, tenants, search]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-12">Org Analytics</h1>
          <p className="text-sm text-gray-11">
            Organization earnings breakdown by proxy
          </p>
        </div>
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-11" />
          <input
            type="text"
            placeholder="Search tenants or orgs..."
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
      ) : filteredData.length > 0 ? (
        <div className="space-y-6">
          {filteredData.map(({ org, tenants: orgTenants }) => (
            <OrgSection key={org.id} org={org} tenants={orgTenants} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-11">
          {search
            ? "No matching tenants or organizations found."
            : "No organizations found."}
        </p>
      )}
    </div>
  );
}

function OrgSection({
  org,
  tenants,
}: {
  org: Organization;
  tenants: Tenant[];
}) {
  return (
    <div className="rounded-lg border border-gray-6 bg-gray-2">
      <div className="flex items-center justify-between border-b border-gray-6 px-4 py-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-medium text-gray-12">{org.name}</h2>
          <span className="rounded-full bg-gray-4 px-2 py-0.5 text-xs text-gray-11">
            {tenants.length} {tenants.length === 1 ? "proxy" : "proxies"}
          </span>
        </div>
      </div>

      {tenants.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-6 text-left text-xs font-medium text-gray-11">
                <th className="px-4 py-3">Proxy</th>
                <th className="px-4 py-3 text-right">Earned</th>
                <th className="px-4 py-3 text-right">This Month</th>
                <th className="px-4 py-3 text-right">Change</th>
                <th className="px-4 py-3 text-right">Calls</th>
                <th className="px-4 py-3">Analytics</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => (
                <TenantRow key={tenant.id} tenant={tenant} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-4 py-6 text-sm text-gray-11">No proxies yet.</p>
      )}
    </div>
  );
}

function TenantRow({ tenant }: { tenant: Tenant }) {
  const [showEndpointDialog, setShowEndpointDialog] = useState(false);
  const { data: analytics, isLoading } = useSWR(
    `/api/admin/tenants/${tenant.id}/analytics`,
    api.get<EarningsAnalytics>,
  );

  return (
    <tr className="border-b border-gray-6 last:border-0">
      <td className="px-4 py-3">
        <span className="text-sm text-gray-12">{tenant.name}</span>
        {tenant.status !== "active" && (
          <span className="ml-2 rounded bg-yellow-900/30 px-1.5 py-0.5 text-xs text-yellow-400">
            {tenant.status}
          </span>
        )}
      </td>
      <td
        className={`px-4 py-3 text-right text-sm ${isLoading ? "text-gray-9" : getValueColor(analytics?.total_earned_usdc)}`}
      >
        {isLoading ? "..." : formatUSDC(analytics?.total_earned_usdc)}
      </td>
      <td
        className={`px-4 py-3 text-right text-sm ${isLoading ? "text-gray-9" : getValueColor(analytics?.current_month_earned_usdc)}`}
      >
        {isLoading ? "..." : formatUSDC(analytics?.current_month_earned_usdc)}
      </td>
      <td
        className={`px-4 py-3 text-right text-sm ${isLoading ? "text-gray-9" : getChangeColor(analytics?.percent_change)}`}
      >
        {isLoading ? "..." : formatChange(analytics?.percent_change)}
      </td>
      <td className="px-4 py-3 text-right text-sm text-white">
        {isLoading
          ? "..."
          : (analytics?.total_transactions ?? 0).toLocaleString()}
      </td>
      <td className="px-4 py-3">
        <button
          onClick={() => setShowEndpointDialog(true)}
          className="rounded p-1.5 text-gray-11 hover:bg-gray-4 hover:text-gray-12"
          title="View endpoint breakdown"
        >
          <PieChartIcon className="h-4 w-4" />
        </button>
        {showEndpointDialog && (
          <EndpointEarningsDialog
            tenant={tenant}
            onClose={() => setShowEndpointDialog(false)}
          />
        )}
      </td>
    </tr>
  );
}

function EndpointEarningsDialog({
  tenant,
  onClose,
}: {
  tenant: Tenant;
  onClose: () => void;
}) {
  const { data: endpoints, isLoading } = useSWR(
    `/api/admin/tenants/${tenant.id}/endpoints`,
    api.get<Endpoint[]>,
  );

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-lg border border-gray-6 bg-gray-2 p-6 shadow-lg">
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-gray-12">
              Endpoint Earnings for {tenant.name}
            </Dialog.Title>
            <Dialog.Close className="rounded p-1 text-gray-11 hover:bg-gray-4 hover:text-gray-12">
              <Cross2Icon className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="mt-4 max-h-[60vh] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-6 border-t-accent-9" />
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10 text-left text-[12px] text-gray-9">
                    <th className="pb-3 font-medium">Path</th>
                    <th className="pb-3 font-medium">Total Earned</th>
                    <th className="pb-3 font-medium">This Month</th>
                    <th className="pb-3 font-medium">Change</th>
                    <th className="pb-3 font-medium">Calls</th>
                  </tr>
                </thead>
                <tbody>
                  {endpoints?.map((endpoint) => (
                    <EndpointEarningsRow
                      key={endpoint.id}
                      endpoint={endpoint}
                      tenantId={tenant.id}
                    />
                  ))}
                  <CatchAllEarningsRow tenantId={tenant.id} />
                </tbody>
              </table>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function EndpointEarningsRow({
  endpoint,
  tenantId,
}: {
  endpoint: Endpoint;
  tenantId: number;
}) {
  const { data: analytics, isLoading } = useSWR(
    `/api/admin/tenants/${tenantId}/endpoints/${endpoint.id}/analytics`,
    api.get<EarningsAnalytics>,
  );

  return (
    <tr className="border-b border-white/5 text-[13px]">
      <td className="py-3">
        <code className="rounded bg-accent-4 px-1.5 py-0.5 text-xs text-accent-11">
          {endpoint.path ?? endpoint.path_pattern}
        </code>
      </td>
      <td
        className={`py-3 ${isLoading ? "text-gray-9" : getValueColor(analytics?.total_earned_usdc)}`}
      >
        {isLoading ? "..." : formatUSDC(analytics?.total_earned_usdc)}
      </td>
      <td
        className={`py-3 ${isLoading ? "text-gray-9" : getValueColor(analytics?.current_month_earned_usdc)}`}
      >
        {isLoading ? "..." : formatUSDC(analytics?.current_month_earned_usdc)}
      </td>
      <td
        className={`py-3 ${isLoading ? "text-gray-9" : getChangeColor(analytics?.percent_change)}`}
      >
        {isLoading ? "..." : formatChange(analytics?.percent_change)}
      </td>
      <td className="py-3 text-white">
        {isLoading
          ? "..."
          : (analytics?.total_transactions ?? 0).toLocaleString()}
      </td>
    </tr>
  );
}

function CatchAllEarningsRow({ tenantId }: { tenantId: number }) {
  const { data: analytics, isLoading } = useSWR(
    `/api/admin/tenants/${tenantId}/catch-all/analytics`,
    api.get<EarningsAnalytics>,
  );

  return (
    <tr className="border-b border-white/5 bg-gray-3/50 text-[13px]">
      <td className="py-3">
        <code className="rounded bg-accent-4 px-1.5 py-0.5 text-xs text-accent-11">
          /
        </code>
        <span className="ml-2 text-xs text-gray-11">(catch-all)</span>
      </td>
      <td
        className={`py-3 ${isLoading ? "text-gray-9" : getValueColor(analytics?.total_earned_usdc)}`}
      >
        {isLoading ? "..." : formatUSDC(analytics?.total_earned_usdc)}
      </td>
      <td
        className={`py-3 ${isLoading ? "text-gray-9" : getValueColor(analytics?.current_month_earned_usdc)}`}
      >
        {isLoading ? "..." : formatUSDC(analytics?.current_month_earned_usdc)}
      </td>
      <td
        className={`py-3 ${isLoading ? "text-gray-9" : getChangeColor(analytics?.percent_change)}`}
      >
        {isLoading ? "..." : formatChange(analytics?.percent_change)}
      </td>
      <td className="py-3 text-white">
        {isLoading
          ? "..."
          : (analytics?.total_transactions ?? 0).toLocaleString()}
      </td>
    </tr>
  );
}
