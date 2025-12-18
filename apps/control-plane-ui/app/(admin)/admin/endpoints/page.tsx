"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { api } from "@/lib/api/client";
import { OrgSection } from "@/components/admin/collapsible-org-section";

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

  // Group tenants by organization
  const groupedData = useMemo(() => {
    if (!organizations || !tenants) return [];

    const tenantsByOrgId = new Map<number | null, Tenant[]>();

    // Initialize with empty arrays for all orgs
    for (const org of organizations) {
      tenantsByOrgId.set(org.id, []);
    }
    // Add "unassigned" group for tenants without org
    tenantsByOrgId.set(null, []);

    // Group tenants
    for (const tenant of tenants) {
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
  }, [organizations, tenants]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-12">All Endpoints</h1>
        <p className="text-sm text-gray-11">
          View and manage endpoints across all organizations
        </p>
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
            No organizations with tenants found.
          </p>
        </div>
      )}
    </div>
  );
}
