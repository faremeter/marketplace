"use client";

import { useAuth } from "@/lib/auth/context";
import useSWR from "swr";
import { api } from "@/lib/api/client";

interface TenantStats {
  total: number;
  active: number;
}

export default function DashboardPage() {
  const { user, currentOrg } = useAuth();

  const { data: tenants } = useSWR(
    currentOrg ? `/api/organizations/${currentOrg.id}/tenants` : null,
    api.get<{ id: number; name: string; status: string }[]>,
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
            <StatCard title="Total Tenants" value={tenantStats.total} />
            <StatCard title="Active Tenants" value={tenantStats.active} />
            <StatCard title="Organization" value={currentOrg.name} isText />
            <StatCard
              title="Your Role"
              value={
                user?.organizations.find((o) => o.id === currentOrg.id)?.role ??
                "member"
              }
              isText
            />
          </div>

          <div className="rounded-lg border border-white/10 bg-gray-2 p-6">
            <h2 className="mb-4 text-[15px] font-medium text-white">
              Recent Activity
            </h2>
            <p className="text-[13px] text-gray-9">
              No recent activity to display.
            </p>
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
}: {
  title: string;
  value: string | number;
  isText?: boolean;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-gray-2 p-4">
      <p className="text-[12px] text-gray-9">{title}</p>
      <p
        className={`mt-1 font-medium text-white ${isText ? "text-[15px] capitalize" : "text-xl"}`}
      >
        {value}
      </p>
    </div>
  );
}
