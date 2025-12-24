"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/context";
import useSWR from "swr";
import { api } from "@/lib/api/client";
import * as Dialog from "@radix-ui/react-dialog";
import { Cross2Icon, PieChartIcon } from "@radix-ui/react-icons";
import {
  type EarningsAnalytics,
  formatUSDC,
  getValueColor,
  getChangeColor,
  formatChange,
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

interface Endpoint {
  id: number;
  path: string | null;
  path_pattern: string;
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
  const changeText = formatChange(percentChange);

  return (
    <div className="rounded-lg border border-white/10 bg-gray-2 p-4">
      <p className="text-[12px] text-gray-9">{title}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className={`text-[15px] font-medium ${getValueColor(value)}`}>
          {formatUSDC(value)}
        </p>
        {changeText !== "-" && (
          <span
            className={`text-[12px] font-medium ${getChangeColor(percentChange)}`}
          >
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
            <th className="pb-3 font-medium">Calls</th>
            <th className="pb-3 font-medium">Analytics</th>
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
  const [showEndpointDialog, setShowEndpointDialog] = useState(false);
  const { data: analytics, isLoading } = useSWR(
    `/api/organizations/${orgId}/tenants/${tenant.id}/analytics`,
    api.get<EarningsAnalytics>,
  );

  return (
    <tr className="border-b border-white/5 text-[13px]">
      <td className="py-3 text-white">{tenant.name}</td>
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
      <td className="py-3">
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
            orgId={orgId}
            onClose={() => setShowEndpointDialog(false)}
          />
        )}
      </td>
    </tr>
  );
}

function EndpointEarningsDialog({
  tenant,
  orgId,
  onClose,
}: {
  tenant: Tenant;
  orgId: number;
  onClose: () => void;
}) {
  const { data: endpoints, isLoading } = useSWR(
    `/api/tenants/${tenant.id}/endpoints`,
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
            ) : endpoints && endpoints.length > 0 ? (
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
                  {endpoints.map((endpoint) => (
                    <EndpointEarningsRow
                      key={endpoint.id}
                      endpoint={endpoint}
                      tenantId={tenant.id}
                      orgId={orgId}
                    />
                  ))}
                  <CatchAllEarningsRow tenantId={tenant.id} orgId={orgId} />
                </tbody>
              </table>
            ) : (
              <p className="py-4 text-center text-[13px] text-gray-9">
                No endpoints configured.
              </p>
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
  orgId,
}: {
  endpoint: Endpoint;
  tenantId: number;
  orgId: number;
}) {
  const { data: analytics, isLoading } = useSWR(
    `/api/organizations/${orgId}/tenants/${tenantId}/endpoints/${endpoint.id}/analytics`,
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

function CatchAllEarningsRow({
  tenantId,
  orgId,
}: {
  tenantId: number;
  orgId: number;
}) {
  const { data: analytics, isLoading } = useSWR(
    `/api/organizations/${orgId}/tenants/${tenantId}/analytics`,
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
