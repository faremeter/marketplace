"use client";

import { useState } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
} from "@radix-ui/react-icons";
import { useToast } from "@/components/ui/toast";
import { AdminEndpointsTable } from "./admin-endpoints-table";
import { getProxyUrl } from "@/lib/format";

interface Tenant {
  id: number;
  name: string;
  default_price: number;
  default_scheme: string;
  org_slug?: string | null;
}

interface CollapsibleTenantSectionProps {
  tenant: Tenant;
  onTenantUpdate?: () => void;
  defaultExpanded?: boolean;
}

export function CollapsibleTenantSection({
  tenant,
  onTenantUpdate,
  defaultExpanded = false,
}: CollapsibleTenantSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const { toast } = useToast();
  const apiUrl = getProxyUrl({
    proxyName: tenant.name,
    orgSlug: tenant.org_slug,
  });

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(apiUrl);
    toast({ title: "Copied to clipboard", variant: "default" });
  };

  return (
    <div>
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-3 transition-colors cursor-pointer"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsExpanded(!isExpanded);
          }
        }}
      >
        {isExpanded ? (
          <ChevronDownIcon className="h-4 w-4 text-gray-11 flex-shrink-0" />
        ) : (
          <ChevronRightIcon className="h-4 w-4 text-gray-11 flex-shrink-0" />
        )}
        <span className="text-sm font-medium text-gray-12">{tenant.name}</span>
        <code className="text-xs text-gray-11">{apiUrl}</code>
        <button
          onClick={handleCopy}
          className="p-1 rounded hover:bg-gray-4 text-gray-11 hover:text-gray-12"
          title="Copy API URL"
        >
          <CopyIcon className="h-3 w-3" />
        </button>
      </div>
      {isExpanded && (
        <div className="px-3 pb-3">
          <AdminEndpointsTable
            tenantId={tenant.id}
            defaultPrice={tenant.default_price}
            defaultScheme={tenant.default_scheme}
            enabled={isExpanded}
            onDefaultsChange={onTenantUpdate}
          />
        </div>
      )}
    </div>
  );
}
