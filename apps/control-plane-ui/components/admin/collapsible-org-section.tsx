"use client";

import { CollapsibleTenantSection } from "./collapsible-tenant-section";

interface Tenant {
  id: number;
  name: string;
  backend_url: string;
  default_price: number;
  default_scheme: string;
  is_active: boolean;
  status: string;
  wallet_id: number | null;
  wallet_funding_status: string | null;
}

interface Organization {
  id: number;
  name: string;
  slug: string;
}

interface OrgSectionProps {
  org: Organization;
  tenants: Tenant[];
  onTenantUpdate?: () => void;
}

export function OrgSection({ org, tenants, onTenantUpdate }: OrgSectionProps) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-lg font-semibold text-gray-12">{org.name}</h2>
        <span className="rounded-full bg-gray-6 px-2.5 py-0.5 text-xs font-medium text-gray-11">
          {tenants.length} tenant{tenants.length !== 1 ? "s" : ""}
        </span>
      </div>
      {tenants.length > 0 ? (
        <div className="rounded-lg border border-gray-6 bg-gray-2 overflow-hidden divide-y divide-gray-6">
          {tenants.map((tenant) => (
            <CollapsibleTenantSection
              key={tenant.id}
              tenant={tenant}
              onTenantUpdate={onTenantUpdate}
              defaultExpanded={true}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-gray-6 bg-gray-2 px-4 py-3">
          <p className="text-sm text-gray-11">
            No tenants in this organization
          </p>
        </div>
      )}
    </div>
  );
}
