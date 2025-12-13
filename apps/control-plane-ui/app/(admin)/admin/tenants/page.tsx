"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import {
  PlusIcon,
  ExclamationTriangleIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";
import * as Tooltip from "@radix-ui/react-tooltip";
import { api } from "@/lib/api/client";
import { CreateTenantDialog } from "@/components/admin/create-tenant-dialog";
import { InlineOrgSelect } from "@/components/admin/inline-org-select";
import { InlineActiveToggle } from "@/components/admin/inline-active-toggle";
import { InlineAuthEdit } from "@/components/admin/inline-auth-edit";
import { InlineUrlEdit } from "@/components/admin/inline-url-edit";
import { InlineNodeSelect } from "@/components/admin/inline-node-select";
import { useToast } from "@/components/ui/toast";

interface TenantNode {
  id: number;
  name: string;
  cert_status: string | null;
  is_primary: boolean;
}

interface Tenant {
  id: number;
  name: string;
  backend_url: string;
  is_active: boolean;
  wallet_status: string;
  organization_id: number | null;
  organization_name?: string;
  upstream_auth_header: string | null;
  upstream_auth_value: string | null;
  nodes: TenantNode[];
  created_at: string;
}

interface AdminSettings {
  hasWallet: boolean;
  addresses: { solana: string | null; evm: string | null };
}

interface WalletBalances {
  solana: { native: string; usdc: string };
  base: { native: string; usdc: string };
  polygon: { native: string; usdc: string };
  monad: { native: string; usdc: string };
}

export default function AdminTenantsPage() {
  const {
    data: tenants,
    isLoading,
    mutate,
  } = useSWR("/api/admin/tenants", api.get<Tenant[]>, {
    refreshInterval: 3000,
  });
  const { data: adminSettings } = useSWR<AdminSettings>(
    "/api/admin/settings",
    api.get,
  );
  const { data: walletBalances, isLoading: balancesLoading } =
    useSWR<WalletBalances>(
      adminSettings?.hasWallet ? "/api/admin/settings/balances" : null,
      api.get,
    );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const { toast } = useToast();

  const handleRetryFunding = async (tenantId: number) => {
    setRetryingId(tenantId);
    try {
      await api.post(`/api/admin/tenants/${tenantId}/retry-funding`, {});
      mutate();
    } catch {
      toast({
        title: "Error",
        description: "Failed to retry wallet funding",
        variant: "error",
      });
    } finally {
      setRetryingId(null);
    }
  };

  const hasSufficientBalance =
    adminSettings?.hasWallet &&
    walletBalances &&
    parseFloat(walletBalances.solana?.native || "0") > 0 &&
    parseFloat(walletBalances.solana?.usdc || "0") > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-12">Tenants</h1>
          <p className="text-sm text-gray-11">
            Manage all tenants in the system
          </p>
        </div>
        <button
          onClick={() => setDialogOpen(true)}
          disabled={!hasSufficientBalance}
          className="flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium text-black shadow-button transition-colors hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <PlusIcon className="h-4 w-4" />
          New Tenant
        </button>
      </div>

      {!hasSufficientBalance &&
        adminSettings !== undefined &&
        !balancesLoading && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-800 bg-amber-900/20 p-4">
            <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0 text-amber-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-200">
                Cannot create new tenants
              </p>
              <p className="mt-1 text-sm text-amber-300/80">
                The master wallet needs both SOL and USDC to fund new tenant
                wallets.{" "}
                <Link
                  href="/admin/settings"
                  className="underline hover:text-amber-200"
                >
                  Go to Settings
                </Link>{" "}
                to add funds.
              </p>
            </div>
          </div>
        )}

      <CreateTenantDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => mutate()}
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-6 border-t-accent-9" />
        </div>
      ) : tenants?.length ? (
        <div className="overflow-hidden rounded-lg border border-gray-6">
          <table className="w-full">
            <thead className="bg-gray-3">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                  ID
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                  Nodes
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                  Backend URL
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                  Organization
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                  Auth
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                  Active
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-6 bg-gray-2">
              {tenants.map((tenant) => (
                <tr key={tenant.id} className="hover:bg-gray-3">
                  <td className="px-4 py-3 text-sm text-gray-11">
                    {tenant.id}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-12">
                    {tenant.name}
                  </td>
                  <td className="px-4 py-3">
                    <InlineNodeSelect
                      tenantId={tenant.id}
                      tenantName={tenant.name}
                      nodes={tenant.nodes}
                      onUpdate={() => mutate()}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <InlineUrlEdit
                      tenantId={tenant.id}
                      tenantName={tenant.name}
                      backendUrl={tenant.backend_url}
                      onUpdate={() => mutate()}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <InlineOrgSelect
                      tenantId={tenant.id}
                      tenantName={tenant.name}
                      currentOrgId={tenant.organization_id}
                      currentOrgName={tenant.organization_name ?? null}
                      onUpdate={() => mutate()}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <InlineAuthEdit
                      tenantId={tenant.id}
                      tenantName={tenant.name}
                      authHeader={tenant.upstream_auth_header}
                      authValue={tenant.upstream_auth_value}
                      onUpdate={() => mutate()}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <InlineActiveToggle
                      tenantId={tenant.id}
                      tenantName={tenant.name}
                      isActive={tenant.is_active}
                      onUpdate={() => mutate()}
                    />
                  </td>
                  <td className="px-4 py-3">
                    {(() => {
                      const hasCertPending = tenant.nodes.some(
                        (n) => n.cert_status === "pending",
                      );
                      const hasCertFailed = tenant.nodes.some(
                        (n) => n.cert_status === "failed",
                      );
                      const allCertsActive =
                        tenant.nodes.length > 0 &&
                        tenant.nodes.every(
                          (n) => n.cert_status === "provisioned",
                        );

                      const StatusBadge = ({
                        label,
                        tooltip,
                        color,
                        children,
                      }: {
                        label: string;
                        tooltip: string;
                        color: "yellow" | "red" | "green" | "gray";
                        children?: React.ReactNode;
                      }) => (
                        <Tooltip.Provider delayDuration={0}>
                          <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                              <div className="flex items-center gap-2">
                                <span
                                  className={`inline-flex cursor-help rounded-full border px-2 py-0.5 text-xs ${
                                    color === "yellow"
                                      ? "border-yellow-800 bg-yellow-900/50 text-yellow-400"
                                      : color === "red"
                                        ? "border-red-800 bg-red-900/50 text-red-400"
                                        : color === "green"
                                          ? "border-green-800 bg-green-900/50 text-green-400"
                                          : "border-gray-700 bg-gray-800/50 text-gray-400"
                                  }`}
                                >
                                  {label}
                                </span>
                                {children}
                              </div>
                            </Tooltip.Trigger>
                            <Tooltip.Portal>
                              <Tooltip.Content
                                className="rounded bg-gray-1 px-2 py-1 text-xs text-gray-12 shadow-lg border border-gray-6"
                                sideOffset={5}
                              >
                                {tooltip}
                                <Tooltip.Arrow className="fill-gray-6" />
                              </Tooltip.Content>
                            </Tooltip.Portal>
                          </Tooltip.Root>
                        </Tooltip.Provider>
                      );

                      if (hasCertPending) {
                        return (
                          <StatusBadge
                            label="Provisioning"
                            tooltip="TLS certificate is being provisioned"
                            color="yellow"
                          />
                        );
                      }
                      if (hasCertFailed) {
                        return (
                          <StatusBadge
                            label="Failed"
                            tooltip="TLS certificate provisioning failed"
                            color="red"
                          />
                        );
                      }
                      if (tenant.wallet_status === "pending") {
                        return (
                          <StatusBadge
                            label="Funding"
                            tooltip="Wallet is being funded with SOL and USDC"
                            color="yellow"
                          />
                        );
                      }
                      if (tenant.wallet_status === "failed") {
                        return (
                          <StatusBadge
                            label="Failed"
                            tooltip="Wallet funding failed"
                            color="red"
                          >
                            <button
                              onClick={() => handleRetryFunding(tenant.id)}
                              disabled={retryingId === tenant.id}
                              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-gray-11 hover:bg-gray-4 hover:text-gray-12 disabled:opacity-50"
                              title="Retry wallet funding"
                            >
                              <ReloadIcon
                                className={`h-3 w-3 ${retryingId === tenant.id ? "animate-spin" : ""}`}
                              />
                            </button>
                          </StatusBadge>
                        );
                      }
                      if (allCertsActive && tenant.wallet_status === "funded") {
                        return (
                          <StatusBadge
                            label="Ready"
                            tooltip="Wallet funded and TLS provisioned"
                            color="green"
                          />
                        );
                      }
                      return (
                        <StatusBadge
                          label="Pending"
                          tooltip="Waiting for node assignment"
                          color="gray"
                        />
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-11">
                    {new Date(tenant.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-6 bg-gray-2 p-6 text-center">
          <p className="text-sm text-gray-11">No tenants found.</p>
        </div>
      )}
    </div>
  );
}
