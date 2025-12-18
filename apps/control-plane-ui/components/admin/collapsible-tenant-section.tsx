"use client";

import { useState } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
} from "@radix-ui/react-icons";
import { useToast } from "@/components/ui/toast";
import { AdminEndpointsTable } from "./admin-endpoints-table";

interface Tenant {
  id: number;
  name: string;
  backend_url: string;
  default_price_usdc: number;
  default_scheme: string;
  is_active: boolean;
  status: string;
  wallet_id: number | null;
  wallet_funding_status: string | null;
}

interface CollapsibleTenantSectionProps {
  tenant: Tenant;
  onTenantUpdate?: () => void;
  defaultExpanded?: boolean;
}

function getTenantStatus(tenant: Tenant) {
  if (tenant.status === "deleting") {
    return { label: "Deleting", color: "red" };
  }
  if (tenant.status === "failed") {
    return { label: "Failed", color: "red" };
  }
  if (tenant.status === "pending" || tenant.status === "provisioning") {
    return { label: "Provisioning", color: "yellow" };
  }
  if (tenant.status === "initializing") {
    return { label: "Initializing", color: "yellow" };
  }
  if (!tenant.wallet_id) {
    return { label: "No Wallet", color: "red" };
  }
  if (tenant.wallet_funding_status !== "funded") {
    return { label: "Unfunded", color: "yellow" };
  }
  return { label: "Ready", color: "green" };
}

export function CollapsibleTenantSection({
  tenant,
  onTenantUpdate,
  defaultExpanded = false,
}: CollapsibleTenantSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const { toast } = useToast();
  const status = getTenantStatus(tenant);
  const apiUrl = `https://${tenant.name}.api.corbits.dev`;

  const statusColors = {
    green: "bg-green-900/50 text-green-400 border-green-800",
    yellow: "bg-yellow-900/50 text-yellow-400 border-yellow-800",
    red: "bg-red-900/50 text-red-400 border-red-800",
  };

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
        <span
          className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium border ${statusColors[status.color as keyof typeof statusColors]}`}
        >
          {status.label}
        </span>
      </div>
      {isExpanded && (
        <div className="px-3 pb-3">
          <AdminEndpointsTable
            tenantId={tenant.id}
            defaultPriceUsdc={tenant.default_price_usdc}
            defaultScheme={tenant.default_scheme}
            enabled={isExpanded}
            onDefaultsChange={onTenantUpdate}
          />
        </div>
      )}
    </div>
  );
}
