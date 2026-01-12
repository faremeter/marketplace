"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/api/client";
import { OrgSection } from "@/components/admin/collapsible-org-section";
import { MagnifyingGlassIcon } from "@radix-ui/react-icons";

interface Organization {
  id: number;
  name: string;
  slug: string;
  is_admin: boolean;
  created_at: string;
  member_count?: number;
  tenant_count?: number;
}

interface Tenant {
  id: number;
  name: string;
  backend_url: string;
  organization_id: number | null;
  organization_name: string | null;
  default_price_usdc: number;
  default_scheme: string;
  is_active: boolean;
  status: string;
  wallet_id: number | null;
  wallet_funding_status: string | null;
}

export default function AdminEndpointsPage() {
  const [search, setSearch] = useState("");

  const { data: organizations, isLoading: orgsLoading } = useSWR(
    "/api/admin/organizations",
    api.get<Organization[]>,
  );

  const {
    data: tenants,
    isLoading: tenantsLoading,
    mutate: mutateTenants,
  } = useSWR("/api/admin/tenants", api.get<Tenant[]>);

  const isLoading = orgsLoading || tenantsLoading;

  // Group tenants by organization, filtered by search
  const groupedData = useMemo(() => {
    if (!organizations || !tenants) return [];

    const searchLower = search.toLowerCase();

    // Filter tenants by search (matches tenant name or org name)
    const filteredTenants = search
      ? tenants.filter(
          (t) =>
            t.name.toLowerCase().includes(searchLower) ||
            t.organization_name?.toLowerCase().includes(searchLower),
        )
      : tenants;

    const tenantsByOrgId = new Map<number | null, Tenant[]>();

    // Initialize with empty arrays for all orgs
    for (const org of organizations) {
      tenantsByOrgId.set(org.id, []);
    }
    // Add "unassigned" group for tenants without org
    tenantsByOrgId.set(null, []);

    // Group tenants
    for (const tenant of filteredTenants) {
      const orgId = tenant.organization_id;
      const existing = tenantsByOrgId.get(orgId) ?? [];
      existing.push(tenant);
      tenantsByOrgId.set(orgId, existing);
    }

    // Sort tenants within each group by name
    for (const [, tenantList] of tenantsByOrgId) {
      tenantList.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Build result: orgs sorted by name, then unassigned at end
    const result: { org: Organization | null; tenants: Tenant[] }[] = [];

    const sortedOrgs = [...organizations].sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    for (const org of sortedOrgs) {
      const orgTenants = tenantsByOrgId.get(org.id) ?? [];
      if (orgTenants.length > 0) {
        result.push({ org, tenants: orgTenants });
      }
    }

    // Add unassigned tenants if any
    const unassignedTenants = tenantsByOrgId.get(null) ?? [];
    if (unassignedTenants.length > 0) {
      result.push({
        org: {
          id: 0,
          name: "Unassigned",
          slug: "unassigned",
          is_admin: false,
          created_at: "",
        },
        tenants: unassignedTenants,
      });
    }

    return result;
  }, [organizations, tenants, search]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-12">All Endpoints</h1>
          <p className="text-sm text-gray-11">
            View and manage endpoints across all organizations
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
      ) : groupedData.length > 0 ? (
        <div className="space-y-8">
          {groupedData.map(({ org, tenants: orgTenants }) =>
            org ? (
              <OrgSection
                key={org.id}
                org={org}
                tenants={orgTenants}
                onTenantUpdate={() => mutateTenants()}
              />
            ) : null,
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-gray-6 bg-gray-2 p-6 text-center">
          <p className="text-sm text-gray-11">
            {search
              ? "No matching tenants or organizations found."
              : "No organizations with tenants found."}
          </p>
        </div>
      )}
    </div>
  );
}
