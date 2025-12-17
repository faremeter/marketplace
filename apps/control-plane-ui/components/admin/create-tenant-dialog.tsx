"use client";

import { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Checkbox from "@radix-ui/react-checkbox";
import * as Select from "@radix-ui/react-select";
import {
  Cross2Icon,
  CheckIcon,
  ChevronDownIcon,
  PlusIcon,
  MinusIcon,
} from "@radix-ui/react-icons";
import useSWR from "swr";
import { api } from "@/lib/api/client";
import { useToast } from "@/components/ui/toast";

interface Node {
  id: number;
  name: string;
  status: string;
  tenant_count: number;
}

interface Organization {
  id: number;
  name: string;
  slug: string;
  is_admin: boolean;
}

interface Wallet {
  id: number;
  name: string;
  organization_id: number | null;
  funding_status: string;
}

interface CreateTenantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateTenantDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateTenantDialogProps) {
  const { toast } = useToast();
  const { data: nodes } = useSWR(
    open ? "/api/admin/nodes" : null,
    api.get<Node[]>,
  );
  const { data: organizations } = useSWR(
    open ? "/api/admin/organizations" : null,
    api.get<Organization[]>,
  );
  const { data: allWallets } = useSWR(
    open ? "/api/admin/wallets" : null,
    api.get<Wallet[]>,
  );

  const [name, setName] = useState("");
  const [selectedNodeIds, setSelectedNodeIds] = useState<number[]>([]);
  const [backendUrl, setBackendUrl] = useState("");
  const [authHeader, setAuthHeader] = useState("");
  const [authValue, setAuthValue] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [walletId, setWalletId] = useState<number | null>(null);
  const [defaultPrice, setDefaultPrice] = useState("0.01");
  const [defaultScheme, setDefaultScheme] = useState("exact");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open && organizations && !organizationId) {
      const adminOrg = organizations.find((o) => o.is_admin);
      if (adminOrg) {
        setOrganizationId(String(adminOrg.id));
      }
    }
  }, [open, organizations, organizationId]);

  // Filter wallets based on selected organization
  const availableWallets = allWallets?.filter((w) => {
    if (!organizationId) {
      // No org selected - show master wallets only
      return w.organization_id === null;
    }
    // Org selected - show org's wallets and master wallets
    return (
      w.organization_id === parseInt(organizationId) ||
      w.organization_id === null
    );
  });

  const resetForm = () => {
    setName("");
    setSelectedNodeIds([]);
    setBackendUrl("");
    setAuthHeader("");
    setAuthValue("");
    setOrganizationId("");
    setWalletId(null);
    setDefaultPrice("0.01");
    setDefaultScheme("exact");
    setError("");
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (selectedNodeIds.length === 0) {
      setError("At least one node is required");
      return;
    }
    if (!backendUrl.trim()) {
      setError("Backend URL is required");
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post("/api/admin/tenants", {
        name: name.trim(),
        node_ids: selectedNodeIds,
        backend_url: backendUrl.trim(),
        upstream_auth_header: authHeader.trim() || null,
        upstream_auth_value: authValue.trim() || null,
        organization_id: organizationId ? parseInt(organizationId) : null,
        wallet_id: walletId,
        default_price_usdc: Math.round(
          (parseFloat(defaultPrice) || 0) * 1_000_000,
        ),
        default_scheme: defaultScheme,
      });
      handleOpenChange(false);
      toast({
        title: "Tenant created",
        description: `${name.trim()} has been created successfully.`,
        variant: "success",
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create tenant");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 max-h-[85vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-gray-6 bg-gray-1 p-6 shadow-xl">
          <div className="mb-6 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-gray-12">
              New Tenant
            </Dialog.Title>
            <Dialog.Close className="rounded p-1 text-gray-11 hover:bg-gray-4 hover:text-gray-12">
              <Cross2Icon className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Info */}
            <section>
              <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-11">
                Basic Info
              </h3>
              <div>
                <label className="mb-1.5 block text-sm text-gray-11">
                  Tenant Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="my-api-tenant"
                  className="w-full rounded-md border border-gray-6 bg-gray-2 px-3 py-2 text-sm text-gray-12 placeholder-gray-9 focus:border-accent-8 focus:outline-none focus:ring-1 focus:ring-accent-8"
                />
              </div>
            </section>

            {/* Infrastructure */}
            <section>
              <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-11">
                Infrastructure
              </h3>
              <div>
                <label className="mb-1.5 block text-sm text-gray-11">
                  Nodes <span className="text-red-400">*</span>
                </label>
                <div className="space-y-2 rounded-md border border-gray-6 bg-gray-2 p-3">
                  {nodes
                    ?.filter((n) => n.status === "active")
                    .map((node) => {
                      const isChecked = selectedNodeIds.includes(node.id);
                      const isPrimary = selectedNodeIds[0] === node.id;
                      return (
                        <label
                          key={node.id}
                          className="flex cursor-pointer items-center gap-3 rounded-md p-2 transition-colors hover:bg-gray-3"
                        >
                          <Checkbox.Root
                            checked={isChecked}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedNodeIds([
                                  ...selectedNodeIds,
                                  node.id,
                                ]);
                              } else {
                                setSelectedNodeIds(
                                  selectedNodeIds.filter(
                                    (id) => id !== node.id,
                                  ),
                                );
                              }
                            }}
                            className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                              isChecked
                                ? "border-gray-12 bg-gray-12"
                                : "border-gray-6 bg-gray-3 hover:border-gray-8"
                            }`}
                          >
                            <Checkbox.Indicator>
                              <CheckIcon className="h-3.5 w-3.5 text-gray-1" />
                            </Checkbox.Indicator>
                          </Checkbox.Root>
                          <div className="flex flex-1 items-center justify-between">
                            <span className="text-sm text-gray-12">
                              {node.name}
                            </span>
                            <div className="flex items-center gap-2">
                              {isPrimary && (
                                <span className="rounded-full border border-blue-800 bg-blue-900/50 px-2 py-0.5 text-xs text-blue-400">
                                  Primary
                                </span>
                              )}
                              <span className="text-xs text-gray-11">
                                {node.tenant_count} tenant
                                {node.tenant_count !== 1 ? "s" : ""}
                              </span>
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  {nodes?.filter((n) => n.status === "active").length === 0 && (
                    <p className="text-sm text-gray-11">
                      No active nodes available
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* Backend */}
            <section>
              <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-11">
                Backend
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-sm text-gray-11">
                    Backend URL <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="url"
                    value={backendUrl}
                    onChange={(e) => setBackendUrl(e.target.value)}
                    placeholder="https://api.example.com"
                    className="w-full rounded-md border border-gray-6 bg-gray-2 px-3 py-2 text-sm text-gray-12 placeholder-gray-9 focus:border-accent-8 focus:outline-none focus:ring-1 focus:ring-accent-8"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-sm text-gray-11">
                      Auth Header
                    </label>
                    <input
                      type="text"
                      value={authHeader}
                      onChange={(e) => setAuthHeader(e.target.value)}
                      placeholder="Authorization"
                      className="w-full rounded-md border border-gray-6 bg-gray-2 px-3 py-2 text-sm text-gray-12 placeholder-gray-9 focus:border-accent-8 focus:outline-none focus:ring-1 focus:ring-accent-8"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm text-gray-11">
                      Auth Value
                    </label>
                    <input
                      type="password"
                      value={authValue}
                      onChange={(e) => setAuthValue(e.target.value)}
                      placeholder="Bearer token..."
                      className="w-full rounded-md border border-gray-6 bg-gray-2 px-3 py-2 text-sm text-gray-12 placeholder-gray-9 focus:border-accent-8 focus:outline-none focus:ring-1 focus:ring-accent-8"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Organization */}
            <section>
              <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-11">
                Organization
              </h3>
              <div>
                <label className="mb-1.5 block text-sm text-gray-11">
                  Organization
                </label>
                <select
                  value={organizationId}
                  onChange={(e) => setOrganizationId(e.target.value)}
                  className="w-full rounded-md border border-gray-6 bg-gray-2 px-3 py-2 text-sm text-gray-12 focus:border-accent-8 focus:outline-none focus:ring-1 focus:ring-accent-8"
                >
                  <option value="">No organization</option>
                  {organizations?.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </div>
            </section>

            {/* Wallet */}
            <section>
              <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-11">
                Wallet
              </h3>
              <div>
                <label className="mb-1.5 block text-sm text-gray-11">
                  Select Wallet
                </label>
                <Select.Root
                  value={walletId?.toString() ?? ""}
                  onValueChange={(value) =>
                    setWalletId(value ? Number(value) : null)
                  }
                >
                  <Select.Trigger className="flex w-full items-center justify-between rounded-md border border-gray-6 bg-gray-2 px-3 py-2 text-sm text-gray-12 focus:border-accent-8 focus:outline-none focus:ring-1 focus:ring-accent-8">
                    <Select.Value placeholder="Select a wallet" />
                    <Select.Icon>
                      <ChevronDownIcon className="h-4 w-4 text-gray-11" />
                    </Select.Icon>
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content
                      className="overflow-hidden rounded-md border border-gray-6 bg-gray-2 shadow-lg"
                      position="popper"
                      sideOffset={4}
                    >
                      <Select.Viewport className="p-1">
                        {!availableWallets?.length && (
                          <div className="px-3 py-2 text-sm text-gray-11">
                            No wallets available
                          </div>
                        )}
                        {availableWallets?.map((wallet) => {
                          const isMaster = wallet.organization_id === null;
                          const isUnfunded = wallet.funding_status !== "funded";
                          return (
                            <Select.Item
                              key={wallet.id}
                              value={wallet.id.toString()}
                              disabled={isUnfunded}
                              className="relative flex w-full cursor-pointer select-none items-center justify-between gap-4 rounded px-8 py-2 text-sm outline-none hover:bg-gray-4 data-[highlighted]:bg-gray-4 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[disabled]:hover:bg-transparent"
                            >
                              <Select.ItemIndicator className="absolute left-2 inline-flex items-center">
                                <CheckIcon className="h-4 w-4 text-accent-11" />
                              </Select.ItemIndicator>
                              <Select.ItemText>
                                <span
                                  className={isMaster ? "text-purple-400" : ""}
                                >
                                  {wallet.name}
                                </span>
                              </Select.ItemText>
                              <div className="flex items-center gap-2">
                                {isMaster && (
                                  <span className="rounded-full border border-purple-800 bg-purple-900/30 px-2 py-0.5 text-xs text-purple-400">
                                    master
                                  </span>
                                )}
                                {isUnfunded && (
                                  <span className="rounded-full border border-yellow-800 bg-yellow-900/30 px-2 py-0.5 text-xs text-yellow-400">
                                    unfunded
                                  </span>
                                )}
                              </div>
                            </Select.Item>
                          );
                        })}
                      </Select.Viewport>
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>
                <p className="mt-1 text-xs text-gray-9">
                  {organizationId
                    ? "Showing organization wallets and master wallets"
                    : "Select an organization to see its wallets"}
                </p>
              </div>
            </section>

            {/* Pricing */}
            <section>
              <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-11">
                Pricing
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm text-gray-11">
                    Default Price
                  </label>
                  <div className="flex items-center gap-0 rounded-md border border-gray-6 bg-gray-2">
                    <button
                      type="button"
                      onClick={() => {
                        const val = Math.max(
                          0,
                          parseFloat(defaultPrice) - 0.01,
                        );
                        setDefaultPrice(
                          val.toFixed(6).replace(/\.?0+$/, "") || "0",
                        );
                      }}
                      className="flex h-9 w-9 items-center justify-center text-gray-11 hover:bg-gray-3 hover:text-gray-12 transition-colors rounded-l-md"
                    >
                      <MinusIcon className="h-4 w-4" />
                    </button>
                    <div className="flex flex-1 items-center">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={defaultPrice}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === "" || /^\d*\.?\d*$/.test(val)) {
                            setDefaultPrice(val);
                          }
                        }}
                        className="w-full bg-transparent py-2 text-center text-sm text-gray-12 focus:outline-none"
                      />
                      <span className="pr-2 text-xs text-gray-11">USDC</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const val = parseFloat(defaultPrice || "0") + 0.01;
                        setDefaultPrice(val.toFixed(6).replace(/\.?0+$/, ""));
                      }}
                      className="flex h-9 w-9 items-center justify-center text-gray-11 hover:bg-gray-3 hover:text-gray-12 transition-colors rounded-r-md"
                    >
                      <PlusIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm text-gray-11">
                    Scheme
                  </label>
                  <select
                    value={defaultScheme}
                    onChange={(e) => setDefaultScheme(e.target.value)}
                    className="w-full rounded-md border border-gray-6 bg-gray-2 px-3 py-2 text-sm text-gray-12 focus:border-accent-8 focus:outline-none focus:ring-1 focus:ring-accent-8"
                  >
                    <option value="exact">exact</option>
                    <option value="upto">upto</option>
                  </select>
                </div>
              </div>
            </section>

            {error && (
              <div className="rounded-md border border-red-800 bg-red-900/20 px-3 py-2 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                className="rounded-md border border-gray-6 px-4 py-2 text-sm text-gray-11 hover:bg-gray-3"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black shadow-button transition-colors hover:bg-white/90 disabled:opacity-50"
              >
                {isSubmitting ? "Creating..." : "Create Tenant"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
