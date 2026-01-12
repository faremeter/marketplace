"use client";

import { useState, useMemo } from "react";
import { useAuth } from "@/lib/auth/context";
import { titleCase } from "@/lib/format";
import useSWR from "swr";
import { api } from "@/lib/api/client";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import {
  Cross2Icon,
  PieChartIcon,
  CaretUpIcon,
  CaretDownIcon,
  CaretSortIcon,
  Pencil1Icon,
} from "@radix-ui/react-icons";
import Link from "next/link";
import {
  type EarningsAnalytics,
  formatUSDC,
  getValueColor,
  getChangeColor,
  formatChange,
} from "@/lib/analytics";
import { type WalletConfig, isWalletUsable } from "@/lib/wallet";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface DailyCallData {
  period: string;
  total_usdc: number;
  call_count: number;
}

type SortColumn = "name" | "total_earned" | "this_month" | "change" | "calls";
type SortDirection = "asc" | "desc";

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

interface Wallet {
  id: number;
  funding_status: string;
  wallet_config: WalletConfig;
}

export default function DashboardPage() {
  const { user, currentOrg } = useAuth();

  const { data: tenants } = useSWR(
    currentOrg ? `/api/organizations/${currentOrg.id}/tenants` : null,
    api.get<Tenant[]>,
  );

  const { data: wallets } = useSWR(
    currentOrg ? `/api/wallets/organization/${currentOrg.id}` : null,
    api.get<Wallet[]>,
  );

  const hasFundedWallet = wallets?.some((w) =>
    isWalletUsable(w.wallet_config, w.funding_status),
  );

  const { data: analytics } = useSWR(
    currentOrg ? `/api/organizations/${currentOrg.id}/analytics` : null,
    api.get<EarningsAnalytics>,
  );

  const { data: dailyData } = useSWR(
    currentOrg
      ? `/api/organizations/${currentOrg.id}/analytics/earnings?level=organization&targetId=${currentOrg.id}&granularity=day&periods=30`
      : null,
    api.get<DailyCallData[]>,
  );

  const chartData = useMemo(() => {
    const dataMap = new Map<string, number>();
    if (dailyData && Array.isArray(dailyData)) {
      dailyData.forEach((d) => dataMap.set(d.period, d.call_count));
    }
    const result = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const period = date.toISOString().slice(0, 10);
      result.push({
        date: period.slice(5),
        calls: dataMap.get(period) ?? 0,
      });
    }
    return result;
  }, [dailyData]);

  const revenueChartData = useMemo(() => {
    const dataMap = new Map<string, number>();
    if (dailyData && Array.isArray(dailyData)) {
      dailyData.forEach((d) => dataMap.set(d.period, d.total_usdc));
    }
    const result = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const period = date.toISOString().slice(0, 10);
      result.push({
        date: period.slice(5),
        revenue: dataMap.get(period) ?? 0,
      });
    }
    return result;
  }, [dailyData]);

  const tenantStats: TenantStats = {
    total: tenants?.length ?? 0,
    active: tenants?.filter((t) => t.status === "active").length ?? 0,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-medium text-white">Dashboard</h1>
        <p className="text-[13px] text-gray-11">
          Welcome back,{" "}
          <span className="text-corbits-orange">
            {titleCase(user?.email.split("@")[0] ?? "")}
          </span>
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

          {tenants && tenants.length > 0 ? (
            <>
              <Tabs.Root
                defaultValue="revenue"
                className="rounded-lg border border-white/10 bg-gray-2 p-6"
              >
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-[15px] font-medium text-white">
                    Activity{" "}
                    <span className="text-xs font-normal text-gray-9">
                      Last 30 Days
                    </span>
                  </h2>
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
                    {dailyData && dailyData.length > 0 ? (
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
                    {dailyData && dailyData.length > 0 ? (
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

              <div className="rounded-lg border border-white/10 bg-gray-2 p-6">
                <h2 className="mb-4 text-[15px] font-medium text-white">
                  Earnings by Proxy
                </h2>
                <TenantEarningsTable tenants={tenants} orgId={currentOrg.id} />
              </div>
            </>
          ) : (
            <div className="relative overflow-hidden rounded-xl border border-corbits-orange bg-gradient-to-br from-corbits-orange/10 via-gray-2 to-gray-2 p-8">
              <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-corbits-orange/10 blur-3xl" />
              <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-corbits-orange/5 blur-2xl" />
              <div className="relative">
                <h2 className="mb-3 text-2xl font-semibold text-white">
                  Create your first proxy
                </h2>
                <p className="mb-6 max-w-md text-sm text-gray-11">
                  Name your API, set your price, start earning in seconds.
                  Payments flow directly to your wallet.
                </p>
                <Link
                  href={hasFundedWallet ? "/proxies" : "/wallets"}
                  className="inline-flex items-center gap-2 rounded-lg bg-corbits-orange px-5 py-2.5 text-sm font-semibold text-black shadow-lg shadow-corbits-orange/25 transition-all hover:bg-corbits-orange/90 hover:shadow-corbits-orange/40"
                >
                  Get Started
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 7l5 5m0 0l-5 5m5-5H6"
                    />
                  </svg>
                </Link>
              </div>
            </div>
          )}
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
  const [sortColumn, setSortColumn] = useState<SortColumn>("total_earned");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [tenantAnalytics, setTenantAnalytics] = useState<
    Record<number, EarningsAnalytics>
  >({});

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
  };

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) {
      return <CaretSortIcon className="h-3 w-3 text-gray-9" />;
    }
    return sortDirection === "asc" ? (
      <CaretUpIcon className="h-3 w-3" />
    ) : (
      <CaretDownIcon className="h-3 w-3" />
    );
  };

  const sortedTenants = useMemo(() => {
    return [...tenants].sort((a, b) => {
      const aData = tenantAnalytics[a.id];
      const bData = tenantAnalytics[b.id];
      let comparison = 0;

      switch (sortColumn) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "total_earned":
          comparison =
            (aData?.total_earned_usdc ?? 0) - (bData?.total_earned_usdc ?? 0);
          break;
        case "this_month":
          comparison =
            (aData?.current_month_earned_usdc ?? 0) -
            (bData?.current_month_earned_usdc ?? 0);
          break;
        case "change":
          comparison =
            (aData?.percent_change ?? -Infinity) -
            (bData?.percent_change ?? -Infinity);
          break;
        case "calls":
          comparison =
            (aData?.total_transactions ?? 0) - (bData?.total_transactions ?? 0);
          break;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [tenants, tenantAnalytics, sortColumn, sortDirection]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-white/10 text-left text-[12px] text-gray-9">
            <th className="pb-3 font-medium">
              <button
                onClick={() => handleSort("name")}
                className="inline-flex items-center gap-1 hover:text-white"
              >
                Proxy
                <SortIcon column="name" />
              </button>
            </th>
            <th className="pb-3 font-medium">
              <button
                onClick={() => handleSort("total_earned")}
                className="inline-flex items-center gap-1 hover:text-white"
              >
                Total Earned
                <SortIcon column="total_earned" />
              </button>
            </th>
            <th className="pb-3 font-medium">
              <button
                onClick={() => handleSort("this_month")}
                className="inline-flex items-center gap-1 hover:text-white"
              >
                This Month
                <SortIcon column="this_month" />
              </button>
            </th>
            <th className="pb-3 font-medium">
              <button
                onClick={() => handleSort("change")}
                className="inline-flex items-center gap-1 hover:text-white"
              >
                Change
                <SortIcon column="change" />
              </button>
            </th>
            <th className="pb-3 font-medium">
              <button
                onClick={() => handleSort("calls")}
                className="inline-flex items-center gap-1 hover:text-white"
              >
                Calls
                <SortIcon column="calls" />
              </button>
            </th>
            <th className="pb-3 font-medium">Analytics</th>
            <th className="pb-3"></th>
          </tr>
        </thead>
        <tbody>
          {sortedTenants.map((tenant) => (
            <TenantEarningsRow
              key={tenant.id}
              tenant={tenant}
              orgId={orgId}
              onAnalyticsLoad={(data) =>
                setTenantAnalytics((prev) => ({ ...prev, [tenant.id]: data }))
              }
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TenantEarningsRow({
  tenant,
  orgId,
  onAnalyticsLoad,
}: {
  tenant: Tenant;
  orgId: number;
  onAnalyticsLoad: (data: EarningsAnalytics) => void;
}) {
  const [showEndpointDialog, setShowEndpointDialog] = useState(false);
  const { data: analytics, isLoading } = useSWR(
    `/api/organizations/${orgId}/tenants/${tenant.id}/analytics`,
    api.get<EarningsAnalytics>,
    {
      onSuccess: (data) => onAnalyticsLoad(data),
    },
  );

  return (
    <tr className="border-b border-white/5 text-[13px]">
      <td className="py-3">
        <Link
          href={`/proxies/${tenant.id}`}
          className="text-white hover:text-accent-11 hover:underline"
        >
          {tenant.name}
        </Link>
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
      <td className="py-3">
        <Link
          href={`/proxies/${tenant.id}`}
          className="rounded p-1.5 text-gray-11 hover:bg-gray-4 hover:text-gray-12"
          title="Edit proxy"
        >
          <Pencil1Icon className="h-4 w-4" />
        </Link>
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
                      orgId={orgId}
                    />
                  ))}
                  <CatchAllEarningsRow tenantId={tenant.id} orgId={orgId} />
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
    `/api/organizations/${orgId}/tenants/${tenantId}/catch-all/analytics`,
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
