"use client";

import { useState } from "react";
import { AdminTransactionsTable } from "./admin-transactions-table";
import { getProxyUrl } from "@/lib/format";
import { CopyIcon, CheckIcon, ExternalLinkIcon } from "@radix-ui/react-icons";
import { useToast } from "@/components/ui/toast";

interface Tenant {
  id: number;
  name: string;
  organization_id: number | null;
  organization_name: string | null;
  org_slug?: string | null;
}

interface TenantTransactionsSectionProps {
  tenant: Tenant;
}

export function TenantTransactionsSection({
  tenant,
}: TenantTransactionsSectionProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const proxyUrl = getProxyUrl({
    proxyName: tenant.name,
    orgSlug: tenant.org_slug,
  });

  const handleCopy = async () => {
    await navigator.clipboard.writeText(proxyUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "URL copied to clipboard" });
  };

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-lg font-semibold text-gray-12">{tenant.name}</h2>
        <div className="flex items-center rounded-lg border border-gray-6 bg-gray-3/50">
          <div className="flex items-center gap-2 px-3 py-1.5">
            <code className="text-sm text-gray-11">{proxyUrl}</code>
          </div>
          <button
            onClick={() => void handleCopy()}
            className="border-l border-gray-6 px-2 py-1.5 text-gray-11 hover:bg-gray-4 hover:text-gray-12 transition-colors"
            title="Copy URL"
          >
            {copied ? (
              <CheckIcon className="h-3.5 w-3.5 text-green-400" />
            ) : (
              <CopyIcon className="h-3.5 w-3.5" />
            )}
          </button>
          <a
            href={proxyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="border-l border-gray-6 px-2 py-1.5 text-gray-11 hover:bg-gray-4 hover:text-gray-12 transition-colors rounded-r-lg"
            title="Open in new tab"
          >
            <ExternalLinkIcon className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
      <AdminTransactionsTable tenantId={tenant.id} pageSize={10} />
    </div>
  );
}
