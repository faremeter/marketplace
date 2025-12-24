"use client";

import { useAuth } from "@/lib/auth/context";
import useSWR from "swr";
import { api } from "@/lib/api/client";
import {
  type EarningsAnalytics,
  formatUSDC,
  getValueColor,
} from "@/lib/analytics";

interface TenantStats {
  total: number;
  active: number;
}

interface Tenant {
  id: number;
  name: string;
  status: string;
}

export default function DashboardPage() {
  const { user, currentOrg } = useAuth();

  const { data: tenants } = useSWR(
    currentOrg ? `/api/organizations/${currentOrg.id}/tenants` : null,
    api.get<Tenant[]>,
  );

  const { data: analytics } = useSWR(
    currentOrg ? `/api/organizations/${currentOrg.id}/analytics` : null,
    api.get<EarningsAnalytics>,
  );

  const tenantStats: TenantStats = {
    total: tenants?.length ?? 0,
    active: tenants?.filter((t) => t.status === "active").length ?? 0,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-medium text-white">Dashboard</h1>
        <p className="text-[13px] text-gray-9">
          Welcome back, {user?.email.split("@")[0]}
        </p>
      </div>

      {currentOrg ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total Earned"
              value={formatUSDC(analytics?.total_earned_usdc)}
              isText
              valueColor={getValueColor(analytics?.total_earned_usdc)}
            />
            <EarningsCard
              title="This Month"
              value={analytics?.current_month_earned_usdc}
              percentChange={analytics?.percent_change}
            />
            <StatCard title="Total Proxies" value={tenantStats.total} />
            <StatCard title="Active Proxies" value={tenantStats.active} />
          </div>

          <div className="rounded-lg border border-white/10 bg-gray-2 p-6">
            <h2 className="mb-4 text-[15px] font-medium text-white">
              Earnings by Proxy
            </h2>
            {tenants && tenants.length > 0 ? (
              <TenantEarningsTable tenants={tenants} orgId={currentOrg.id} />
            ) : (
              <p className="text-[13px] text-gray-9">No proxies yet.</p>
            )}
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-white/10 bg-gray-2 p-6">
          <h2 className="mb-2 text-[15px] font-medium text-white">
            No Organization Selected
          </h2>
          <p className="text-[13px] text-gray-9">
            Select an organization from the sidebar to view your dashboard, or
            create a new organization.
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  isText,
  valueColor,
}: {
  title: string;
  value: string | number;
  isText?: boolean;
  valueColor?: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-gray-2 p-4">
      <p className="text-[12px] text-gray-9">{title}</p>
      <p
        className={`mt-1 font-medium ${valueColor ?? "text-white"} ${isText ? "text-[15px]" : "text-xl"}`}
      >
        {value}
      </p>
    </div>
  );
}

function EarningsCard({
  title,
  value,
  percentChange,
}: {
  title: string;
  value?: number;
  percentChange?: number | null;
}) {
  const valueColor = getValueColor(value);

  const changeColor =
    percentChange === null || percentChange === undefined || percentChange === 0
      ? "text-gray-9"
      : percentChange > 0
        ? "text-green-500"
        : "text-red-500";

  const changeText =
    percentChange === null || percentChange === undefined
      ? ""
      : `${percentChange > 0 ? "+" : ""}${percentChange.toFixed(1)}%`;

  return (
    <div className="rounded-lg border border-white/10 bg-gray-2 p-4">
      <p className="text-[12px] text-gray-9">{title}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className={`text-[15px] font-medium ${valueColor}`}>
          {formatUSDC(value)}
        </p>
        {changeText && (
          <span className={`text-[12px] font-medium ${changeColor}`}>
            {changeText}
          </span>
        )}
      </div>
    </div>
  );
}

function TenantEarningsTable({
  tenants,
  orgId,
}: {
  tenants: Tenant[];
  orgId: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-white/10 text-left text-[12px] text-gray-9">
            <th className="pb-3 font-medium">Proxy</th>
            <th className="pb-3 font-medium">Total Earned</th>
            <th className="pb-3 font-medium">This Month</th>
            <th className="pb-3 font-medium">Change</th>
          </tr>
        </thead>
        <tbody>
          {tenants.map((tenant) => (
            <TenantEarningsRow key={tenant.id} tenant={tenant} orgId={orgId} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TenantEarningsRow({
  tenant,
  orgId,
}: {
  tenant: Tenant;
  orgId: number;
}) {
  const { data: analytics, isLoading } = useSWR(
    `/api/organizations/${orgId}/tenants/${tenant.id}/analytics`,
    api.get<EarningsAnalytics>,
  );

  const changeColor =
    analytics?.percent_change === null ||
    analytics?.percent_change === undefined
      ? "text-gray-9"
      : analytics.percent_change > 0
        ? "text-green-500"
        : analytics.percent_change < 0
          ? "text-red-500"
          : "text-gray-9";

  const changeText =
    analytics?.percent_change === null ||
    analytics?.percent_change === undefined
      ? "-"
      : `${analytics.percent_change > 0 ? "+" : ""}${analytics.percent_change.toFixed(1)}%`;

  const totalColor = getValueColor(analytics?.total_earned_usdc);
  const monthColor = getValueColor(analytics?.current_month_earned_usdc);

  return (
    <tr className="border-b border-white/5 text-[13px]">
      <td className="py-3 text-white">{tenant.name}</td>
      <td className={`py-3 ${isLoading ? "text-gray-9" : totalColor}`}>
        {isLoading ? "..." : formatUSDC(analytics?.total_earned_usdc)}
      </td>
      <td className={`py-3 ${isLoading ? "text-gray-9" : monthColor}`}>
        {isLoading ? "..." : formatUSDC(analytics?.current_month_earned_usdc)}
      </td>
      <td className={`py-3 ${isLoading ? "text-gray-9" : changeColor}`}>
        {isLoading ? "..." : changeText}
      </td>
    </tr>
  );
}
