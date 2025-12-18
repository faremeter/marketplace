"use client";

import { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Cross2Icon } from "@radix-ui/react-icons";
import useSWR from "swr";
import { api } from "@/lib/api/client";
import { useToast } from "@/components/ui/toast";

interface Organization {
  id: number;
  name: string;
}

interface Wallet {
  id: number;
  name: string;
  organization_id: number | null;
}

interface Node {
  id: number;
  name: string;
  status: string;
}

interface EditTenantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenant: {
    id: number;
    name: string;
    backend_url: string;
    organization_id: number | null;
    wallet_id: number | null;
    is_active: boolean;
  };
  onSuccess: () => void;
}

export function EditTenantDialog({
  open,
  onOpenChange,
  tenant,
  onSuccess,
}: EditTenantDialogProps) {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [backendUrl, setBackendUrl] = useState(tenant.backend_url);
  const [organizationId, setOrganizationId] = useState<number | null>(
    tenant.organization_id,
  );
  const [walletId, setWalletId] = useState<number | null>(tenant.wallet_id);
  const [isActive, setIsActive] = useState(tenant.is_active);

  const { data: organizations } = useSWR(
    open ? "/api/admin/organizations" : null,
    api.get<Organization[]>,
  );

  const { data: wallets } = useSWR(
    open ? "/api/wallets/admin/all" : null,
    api.get<Wallet[]>,
  );

  const { data: _nodes } = useSWR(
    open ? "/api/admin/nodes" : null,
    api.get<Node[]>,
  );

  // Reset form when tenant changes
  useEffect(() => {
    setBackendUrl(tenant.backend_url);
    setOrganizationId(tenant.organization_id);
    setWalletId(tenant.wallet_id);
    setIsActive(tenant.is_active);
  }, [tenant]);

  // Filter wallets by selected organization (or show master wallets if no org)
  const filteredWallets = wallets?.filter(
    (w) => w.organization_id === null || w.organization_id === organizationId,
  );

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.put(`/api/admin/tenants/${tenant.id}`, {
        backend_url: backendUrl,
        organization_id: organizationId,
        wallet_id: walletId,
        is_active: isActive,
      });
      toast({ title: "Tenant updated", variant: "success" });
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Failed to update tenant",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-gray-6 bg-gray-2 p-6 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold text-gray-12">
              Edit Tenant: {tenant.name}
            </Dialog.Title>
            <Dialog.Close className="rounded p-1 text-gray-11 hover:bg-gray-4 hover:text-gray-12">
              <Cross2Icon className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-11 mb-1">
                Backend URL
              </label>
              <input
                type="url"
                value={backendUrl}
                onChange={(e) => setBackendUrl(e.target.value)}
                className="w-full rounded-md border border-gray-6 bg-gray-3 px-3 py-2 text-sm text-gray-12 focus:border-accent-8 focus:outline-none"
                placeholder="https://api.example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-11 mb-1">
                Organization
              </label>
              <select
                value={organizationId ?? ""}
                onChange={(e) => {
                  const val = e.target.value ? parseInt(e.target.value) : null;
                  setOrganizationId(val);
                  // Reset wallet if org changes and wallet doesn't belong to new org
                  if (walletId) {
                    const wallet = wallets?.find((w) => w.id === walletId);
                    if (
                      wallet &&
                      wallet.organization_id !== null &&
                      wallet.organization_id !== val
                    ) {
                      setWalletId(null);
                    }
                  }
                }}
                className="w-full rounded-md border border-gray-6 bg-gray-3 px-3 py-2 text-sm text-gray-12 focus:border-accent-8 focus:outline-none"
              >
                <option value="">No organization</option>
                {organizations?.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-11 mb-1">
                Wallet
              </label>
              <select
                value={walletId ?? ""}
                onChange={(e) =>
                  setWalletId(e.target.value ? parseInt(e.target.value) : null)
                }
                className="w-full rounded-md border border-gray-6 bg-gray-3 px-3 py-2 text-sm text-gray-12 focus:border-accent-8 focus:outline-none"
              >
                <option value="">No wallet</option>
                {filteredWallets?.map((wallet) => (
                  <option key={wallet.id} value={wallet.id}>
                    {wallet.name}{" "}
                    {wallet.organization_id === null ? "(Master)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isActive"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-gray-6 bg-gray-3 text-accent-9 focus:ring-accent-8"
              />
              <label htmlFor="isActive" className="text-sm text-gray-12">
                Active
              </label>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={() => onOpenChange(false)}
              className="rounded-md px-3 py-2 text-sm font-medium text-gray-11 hover:bg-gray-4 hover:text-gray-12"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="rounded-md bg-accent-9 px-3 py-2 text-sm font-medium text-white hover:bg-accent-10 disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
