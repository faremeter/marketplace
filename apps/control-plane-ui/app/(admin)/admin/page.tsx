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

interface AdminStats {
  users: number;
  organizations: number;
  tenants: number;
  nodes: number;
  transactions: number;
}

export default function AdminDashboardPage() {
  const { data: stats } = useSWR("/api/admin/stats", api.get<AdminStats>);
  const { data: analytics } = useSWR(
    "/api/admin/analytics",
    api.get<EarningsAnalytics>,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-12">Admin Dashboard</h1>
        <p className="text-sm text-gray-11">System overview and management</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <EarningsStatCard
          title="Total Processed"
          value={formatUSDC(analytics?.total_earned)}
          valueColor={getValueColor(analytics?.total_earned)}
        />
        <EarningsStatCard
          title="Processed This Month"
          value={formatUSDC(analytics?.current_month_earned)}
          valueColor={getValueColor(analytics?.current_month_earned)}
          change={formatChange(analytics?.percent_change)}
          changeColor={getChangeColor(analytics?.percent_change)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard title="Users" value={stats?.users ?? 0} href="/admin/users" />
        <StatCard
          title="Organizations"
          value={stats?.organizations ?? 0}
          href="/admin/organizations"
        />
        <StatCard
          title="Tenants"
          value={stats?.tenants ?? 0}
          href="/admin/tenants"
        />
        <StatCard title="Nodes" value={stats?.nodes ?? 0} href="/admin/nodes" />
        <StatCard
          title="Transactions"
          value={stats?.transactions ?? 0}
          href="/admin/transactions"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-6 bg-gray-2 p-6">
          <h2 className="mb-4 text-lg font-medium text-gray-12">
            Recent Users
          </h2>
          <RecentUsersList />
        </div>

        <div className="rounded-lg border border-gray-6 bg-gray-2 p-6">
          <h2 className="mb-4 text-lg font-medium text-gray-12">
            Recent Transactions
          </h2>
          <RecentTransactionsList />
        </div>
      </div>
    </div>
  );
}

function EarningsStatCard({
  title,
  value,
  valueColor,
  change,
  changeColor,
}: {
  title: string;
  value: string;
  valueColor: string;
  change?: string;
  changeColor?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-6 bg-gray-2 p-4">
      <p className="text-sm text-gray-11">{title}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className={`text-2xl font-medium ${valueColor}`}>{value}</p>
        {change && change !== "-" && (
          <span className={`text-sm font-medium ${changeColor}`}>{change}</span>
        )}
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  href,
}: {
  title: string;
  value: number;
  href: string;
}) {
  return (
    <a
      href={href}
      className="block rounded-lg border border-gray-6 bg-gray-2 p-4 transition-colors hover:border-gray-7 hover:bg-gray-3"
    >
      <p className="text-sm text-gray-11">{title}</p>
      <p className="mt-1 text-2xl font-medium text-gray-12">{value}</p>
    </a>
  );
}

function RecentUsersList() {
  const { data: users } = useSWR(
    "/api/admin/users?limit=5",
    api.get<{ id: number; email: string; created_at: string }[]>,
  );

  if (!users?.length) {
    return <p className="text-sm text-gray-11">No users yet.</p>;
  }

  return (
    <ul className="space-y-2">
      {users.map((user) => (
        <li
          key={user.id}
          className="flex items-center justify-between rounded border border-gray-6 bg-gray-3 px-3 py-2"
        >
          <span className="text-sm text-gray-12">{user.email}</span>
          <span className="text-xs text-gray-9">
            {new Date(user.created_at).toLocaleDateString()}
          </span>
        </li>
      ))}
    </ul>
  );
}

function RecentTransactionsList() {
  const { data } = useSWR(
    "/api/admin/transactions?limit=5",
    api.get<{
      transactions: {
        id: number;
        amount: string;
        created_at: string;
        tenant_name: string | null;
        request_path: string | null;
      }[];
      total: number;
    }>,
  );

  if (!data?.transactions?.length) {
    return <p className="text-sm text-gray-11">No transactions yet.</p>;
  }

  return (
    <ul className="space-y-2">
      {data.transactions.map((tx) => (
        <li
          key={tx.id}
          className="rounded border border-gray-6 bg-gray-3 px-3 py-2"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-12">
              {formatUSDC(parseFloat(tx.amount))}
            </span>
            <span className="text-xs text-gray-9">
              {new Date(tx.created_at).toLocaleDateString()}
            </span>
          </div>
          <div className="mt-1 truncate text-xs text-gray-11">
            {tx.tenant_name}
            {tx.tenant_name && tx.request_path && " "}
            {tx.request_path && (
              <span className="text-gray-9">{tx.request_path}</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
