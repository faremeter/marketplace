"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  PlusIcon,
  ExclamationTriangleIcon,
  TrashIcon,
  Cross2Icon,
} from "@radix-ui/react-icons";
import * as Tooltip from "@radix-ui/react-tooltip";
import * as Dialog from "@radix-ui/react-dialog";
import { api, ApiError } from "@/lib/api/client";
import { CreateTenantDialog } from "@/components/admin/create-tenant-dialog";
import { InlineOrgSelect } from "@/components/admin/inline-org-select";
import { InlineWalletSelect } from "@/components/admin/inline-wallet-select";
import { InlineActiveToggle } from "@/components/shared/inline-active-toggle";
import { InlineAuthEdit } from "@/components/shared/inline-auth-edit";
import { InlineUrlEdit } from "@/components/shared/inline-url-edit";
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
  status: string;
  wallet_id: number | null;
  wallet_name: string | null;
  wallet_funding_status: string | null;
  wallet_organization_id: number | null;
  organization_id: number | null;
  organization_name?: string;
  upstream_auth_header: string | null;
  upstream_auth_value: string | null;
  nodes: TenantNode[];
  created_at: string;
}

export default function AdminTenantsPage() {
  const {
    data: tenants,
    isLoading,
    mutate,
  } = useSWR("/api/admin/tenants", api.get<Tenant[]>, {
    refreshInterval: 3000,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tenantToDelete, setTenantToDelete] = useState<Tenant | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleDeleteClick = (tenant: Tenant) => {
    setTenantToDelete(tenant);
    setDeleteError(null);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!tenantToDelete) return;

    setDeletingId(tenantToDelete.id);
    setDeleteError(null);

    try {
      await api.delete(`/api/admin/tenants/${tenantToDelete.id}`);
      setDeleteDialogOpen(false);
      setTenantToDelete(null);
      mutate();
      toast({
        title: "Deletion started",
        description: `${tenantToDelete.name} is being deleted`,
        variant: "success",
      });
    } catch (err) {
      if (err instanceof ApiError && err.data) {
        const data = err.data as { error?: string };
        setDeleteError(data.error || "Failed to delete tenant");
      } else {
        setDeleteError("Failed to delete tenant");
      }
    } finally {
      setDeletingId(null);
    }
  };

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
          className="flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium text-black shadow-button transition-colors hover:bg-white/90"
        >
          <PlusIcon className="h-4 w-4" />
          New Tenant
        </button>
      </div>

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
        <div className="overflow-x-auto rounded-lg border border-gray-6">
          <table className="w-full min-w-[1200px]">
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
                  Wallet
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
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                  Actions
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
                      currentWalletId={tenant.wallet_id}
                      currentWalletName={tenant.wallet_name}
                      currentWalletOrgId={tenant.wallet_organization_id}
                      onUpdate={() => mutate()}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <InlineWalletSelect
                      tenantId={tenant.id}
                      tenantName={tenant.name}
                      tenantOrgId={tenant.organization_id}
                      currentWalletId={tenant.wallet_id}
                      currentWalletName={tenant.wallet_name}
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
                                  className={`inline-flex whitespace-nowrap cursor-help rounded-full border px-2 py-0.5 text-xs ${
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

                      if (tenant.status === "deleting") {
                        return (
                          <StatusBadge
                            label="Deleting"
                            tooltip="Tenant is being removed"
                            color="red"
                          />
                        );
                      }

                      if (tenant.status === "failed") {
                        const hasCertFailed = tenant.nodes.some(
                          (n) => n.cert_status === "failed",
                        );
                        return (
                          <StatusBadge
                            label="Failed"
                            tooltip={
                              hasCertFailed
                                ? "TLS certificate provisioning failed"
                                : "Setup failed"
                            }
                            color="red"
                          />
                        );
                      }

                      if (tenant.status === "pending") {
                        const hasCertPending = tenant.nodes.some(
                          (n) => n.cert_status === "pending",
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

                        return (
                          <StatusBadge
                            label="Initializing"
                            tooltip="Tenant is being set up"
                            color="yellow"
                          />
                        );
                      }

                      if (!tenant.wallet_id) {
                        return (
                          <StatusBadge
                            label="No Wallet"
                            tooltip="No wallet assigned - tenant cannot process requests"
                            color="red"
                          />
                        );
                      }

                      if (tenant.wallet_funding_status !== "funded") {
                        return (
                          <StatusBadge
                            label="Unfunded"
                            tooltip="Wallet not funded - tenant cannot process requests"
                            color="yellow"
                          />
                        );
                      }

                      if (!tenant.is_active) {
                        return (
                          <StatusBadge
                            label="Inactive"
                            tooltip="Tenant is disabled"
                            color="gray"
                          />
                        );
                      }

                      return (
                        <StatusBadge
                          label="Ready"
                          tooltip="Tenant is fully operational"
                          color="green"
                        />
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-11">
                    {new Date(tenant.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDeleteClick(tenant)}
                      disabled={
                        deletingId === tenant.id ||
                        (tenant.status !== "active" &&
                          tenant.status !== "failed")
                      }
                      className="rounded p-1.5 text-gray-11 hover:bg-red-900/30 hover:text-red-400 disabled:opacity-50"
                      title="Delete tenant"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
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

      <Dialog.Root open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-gray-6 bg-gray-2 p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <Dialog.Title className="text-lg font-semibold text-gray-12">
                Delete Tenant
              </Dialog.Title>
              <Dialog.Close className="rounded p-1 text-gray-11 hover:bg-gray-4 hover:text-gray-12">
                <Cross2Icon className="h-4 w-4" />
              </Dialog.Close>
            </div>

            <Dialog.Description asChild>
              <div className="mt-4 space-y-3 text-sm text-gray-11">
                <p>
                  Are you sure you want to delete{" "}
                  <span className="font-medium text-gray-12">
                    {tenantToDelete?.name}
                  </span>
                  ?
                </p>
                <p>
                  This action cannot be undone. All DNS records, TLS
                  certificates, and node configurations will be permanently
                  removed.
                </p>
              </div>
            </Dialog.Description>

            {deleteError && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-800 bg-red-900/20 p-3">
                <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0 text-red-400" />
                <p className="text-sm text-red-300">{deleteError}</p>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setDeleteDialogOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-gray-11 hover:bg-gray-4 hover:text-gray-12"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deletingId !== null}
                className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deletingId !== null ? "Deleting..." : "Delete"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
