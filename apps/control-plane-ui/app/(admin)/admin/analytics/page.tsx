"use client";

import useSWR from "swr";
import { api } from "@/lib/api/client";
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

export default function OrgAnalyticsPage() {
  const { data: organizations, isLoading: orgsLoading } = useSWR(
    "/api/admin/organizations",
    api.get<Organization[]>,
  );

  const { data: tenants, isLoading: tenantsLoading } = useSWR(
    "/api/admin/tenants",
    api.get<Tenant[]>,
  );

  const isLoading = orgsLoading || tenantsLoading;

  const tenantsByOrg = tenants?.reduce(
    (acc, tenant) => {
      const orgId = tenant.organization_id;
      if (!acc[orgId]) acc[orgId] = [];
      acc[orgId].push(tenant);
      return acc;
    },
    {} as Record<number, Tenant[]>,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-12">Org Analytics</h1>
        <p className="text-sm text-gray-11">
          Organization earnings breakdown by proxy
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-6 border-t-accent-9" />
        </div>
      ) : organizations && organizations.length > 0 ? (
        <div className="space-y-6">
          {organizations.map((org) => (
            <OrgSection
              key={org.id}
              org={org}
              tenants={tenantsByOrg?.[org.id] ?? []}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-11">No organizations found.</p>
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
    </tr>
  );
}
