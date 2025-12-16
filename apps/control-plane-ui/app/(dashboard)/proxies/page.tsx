"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/context";
import useSWR from "swr";
import { api, ApiError } from "@/lib/api/client";
import Link from "next/link";
import {
  PlusIcon,
  TrashIcon,
  Cross2Icon,
  ExclamationTriangleIcon,
} from "@radix-ui/react-icons";
import * as Dialog from "@radix-ui/react-dialog";
import { InlineUrlEdit } from "@/components/shared/inline-url-edit";
import { InlineAuthEdit } from "@/components/shared/inline-auth-edit";
import { InlineActiveToggle } from "@/components/shared/inline-active-toggle";
import { CreateUserTenantDialog } from "@/components/tenants/create-user-tenant-dialog";

interface TenantNode {
  id: number;
  cert_status: string | null;
  is_primary: boolean;
}

interface Tenant {
  id: number;
  name: string;
  backend_url: string;
  is_active: boolean;
  status: string;
  wallet_status: string;
  upstream_auth_header: string | null;
  upstream_auth_value: string | null;
  nodes: TenantNode[];
  created_at: string;
}

function getStatus(tenant: Tenant): {
  label: string;
  color: string;
} {
  if (tenant.status === "deleting") {
    return {
      label: "Deleting",
      color: "bg-red-900/50 text-red-400 border-red-800",
    };
  }

  if (tenant.status === "failed") {
    return {
      label: "Pending",
      color: "bg-yellow-900/50 text-yellow-400 border-yellow-800",
    };
  }

  if (tenant.status === "pending") {
    const hasPendingCert = tenant.nodes.some(
      (n) => n.cert_status === "pending",
    );

    if (tenant.wallet_status === "pending") {
      return {
        label: "Funding",
        color: "bg-yellow-900/50 text-yellow-400 border-yellow-800",
      };
    }

    if (hasPendingCert) {
      return {
        label: "Provisioning",
        color: "bg-yellow-900/50 text-yellow-400 border-yellow-800",
      };
    }

    return {
      label: "Initializing",
      color: "bg-yellow-900/50 text-yellow-400 border-yellow-800",
    };
  }

  return {
    label: "Ready",
    color: "bg-green-900/50 text-green-400 border-green-800",
  };
}

export default function TenantsPage() {
  const { currentOrg } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tenantToDelete, setTenantToDelete] = useState<Tenant | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const {
    data: tenants,
    isLoading,
    mutate,
  } = useSWR(
    currentOrg ? `/api/organizations/${currentOrg.id}/tenants` : null,
    api.get<Tenant[]>,
    { refreshInterval: 3000 },
  );

  const handleDeleteClick = (tenant: Tenant) => {
    setTenantToDelete(tenant);
    setDeleteError(null);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!tenantToDelete || !currentOrg) return;

    setDeletingId(tenantToDelete.id);
    setDeleteError(null);

    try {
      await api.delete(
        `/api/organizations/${currentOrg.id}/tenants/${tenantToDelete.id}`,
      );
      setDeleteDialogOpen(false);
      setTenantToDelete(null);
      mutate();
    } catch (err) {
      if (err instanceof ApiError && err.data) {
        const data = err.data as { error?: string; hasWalletFunds?: boolean };
        if (data.hasWalletFunds) {
          setDeleteError(
            "This proxy has funds in its wallet. Please complete a payout before deleting.",
          );
        } else {
          setDeleteError(data.error || "Failed to delete proxy");
        }
      } else {
        setDeleteError("Failed to delete proxy");
      }
    } finally {
      setDeletingId(null);
    }
  };

  if (!currentOrg) {
    return (
      <div className="rounded-lg border border-gray-6 bg-gray-2 p-6">
        <h2 className="mb-2 text-lg font-medium text-gray-12">
          No Organization Selected
        </h2>
        <p className="text-sm text-gray-11">
          Select an organization from the sidebar to view tenants.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-12">Proxies</h1>
          <p className="text-sm text-gray-11">
            Manage x402 proxies for {currentOrg.name}
          </p>
        </div>
        <button
          onClick={() => setIsDialogOpen(true)}
          className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium text-black shadow-button transition-colors hover:bg-white/90"
        >
          <PlusIcon className="h-4 w-4" />
          New Proxy
        </button>
      </div>

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
                  Backend URL
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
              {tenants.map((tenant) => {
                const status = getStatus(tenant);
                const apiEndpoint = `/api/organizations/${currentOrg.id}/tenants/${tenant.id}`;
                return (
                  <tr key={tenant.id} className="hover:bg-gray-3">
                    <td className="px-4 py-3 text-sm text-gray-11">
                      {tenant.id}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/proxies/${tenant.id}`}
                        className="text-sm font-medium text-accent-11 hover:underline"
                      >
                        {tenant.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <InlineUrlEdit
                        tenantId={tenant.id}
                        tenantName={tenant.name}
                        backendUrl={tenant.backend_url}
                        onUpdate={() => mutate()}
                        apiEndpoint={apiEndpoint}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <InlineAuthEdit
                        tenantId={tenant.id}
                        tenantName={tenant.name}
                        authHeader={tenant.upstream_auth_header}
                        authValue={tenant.upstream_auth_value}
                        onUpdate={() => mutate()}
                        apiEndpoint={apiEndpoint}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <InlineActiveToggle
                        tenantId={tenant.id}
                        tenantName={tenant.name}
                        isActive={tenant.is_active}
                        onUpdate={() => mutate()}
                        apiEndpoint={apiEndpoint}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${status.color}`}
                      >
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-11">
                      {new Date(tenant.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDeleteClick(tenant)}
                        disabled={
                          deletingId === tenant.id ||
                          tenant.status === "pending" ||
                          tenant.status === "deleting"
                        }
                        className="rounded p-1.5 text-gray-11 hover:bg-red-900/30 hover:text-red-400 disabled:opacity-50"
                        title="Delete proxy"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-6 bg-gray-2 p-6 text-center">
          <p className="text-sm text-gray-11">No proxies found.</p>
          <button
            onClick={() => setIsDialogOpen(true)}
            className="mt-3 inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium text-black shadow-button transition-colors hover:bg-white/90"
          >
            <PlusIcon className="h-4 w-4" />
            Create your first proxy
          </button>
        </div>
      )}

      <CreateUserTenantDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSuccess={() => mutate()}
        organizationId={currentOrg.id}
      />

      <Dialog.Root open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-gray-6 bg-gray-2 p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <Dialog.Title className="text-lg font-semibold text-gray-12">
                Delete Proxy
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
                <p>This action cannot be undone.</p>
              </div>
            </Dialog.Description>

            <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-800 bg-amber-900/20 p-3">
              <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0 text-amber-400" />
              <p className="text-sm text-amber-300">
                If this proxy has funds in its wallet, you will need to complete
                a payout before deletion.
              </p>
            </div>

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
