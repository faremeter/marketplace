"use client";

import { useState, useEffect } from "react";
import * as Select from "@radix-ui/react-select";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ChevronDownIcon,
  CheckIcon,
  Cross2Icon,
  ExclamationTriangleIcon,
} from "@radix-ui/react-icons";
import useSWR from "swr";
import { api } from "@/lib/api/client";
import { useToast } from "@/components/ui/toast";

interface Organization {
  id: number;
  name: string;
  slug: string;
}

interface Wallet {
  id: number;
  name: string;
  organization_id: number | null;
  funding_status: string;
}

interface InlineOrgSelectProps {
  tenantId: number;
  tenantName: string;
  currentOrgId: number | null;
  currentOrgName: string | null;
  currentOrgSlug: string | null;
  currentWalletId: number | null;
  currentWalletName: string | null;
  currentWalletOrgId: number | null;
  onUpdate: () => void;
  disabled?: boolean;
  disabledReason?: string | null;
}

export function InlineOrgSelect({
  tenantId,
  tenantName,
  currentOrgId,
  currentOrgName,
  currentOrgSlug,
  currentWalletId,
  currentWalletName,
  currentWalletOrgId,
  onUpdate,
  disabled,
  disabledReason,
}: InlineOrgSelectProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [walletDialogOpen, setWalletDialogOpen] = useState(false);
  const [domainDialogOpen, setDomainDialogOpen] = useState(false);
  const [pendingOrgId, setPendingOrgId] = useState<number | null>(null);
  const [pendingOrgName, setPendingOrgName] = useState<string | null>(null);
  const [pendingOrgSlug, setPendingOrgSlug] = useState<string | null>(null);
  const [selectedWalletId, setSelectedWalletId] = useState<number | null>(null);

  const { data: organizations } = useSWR(
    isOpen ? "/api/admin/organizations" : null,
    api.get<Organization[]>,
  );

  const { data: masterWallets } = useSWR(
    walletDialogOpen ? "/api/wallets/admin/master" : null,
    api.get<Wallet[]>,
  );

  const { data: newOrgWallets } = useSWR(
    walletDialogOpen && pendingOrgId
      ? `/api/wallets/organization/${pendingOrgId}`
      : null,
    api.get<Wallet[]>,
  );

  useEffect(() => {
    if (walletDialogOpen && newOrgWallets) {
      const fundedOrgWallet = newOrgWallets.find(
        (w) => w.funding_status === "funded",
      );
      if (fundedOrgWallet) {
        setSelectedWalletId(fundedOrgWallet.id);
      } else {
        setSelectedWalletId(null);
      }
    }
  }, [walletDialogOpen, newOrgWallets]);

  const needsWalletChange = (newOrgId: number | null): boolean => {
    if (!currentWalletId) return false;
    if (currentWalletOrgId === null) return false;
    if (currentWalletOrgId === newOrgId) return false;
    return true;
  };

  const needsDomainChange = (newOrgSlug: string | null): boolean => {
    return currentOrgSlug !== newOrgSlug;
  };

  const handleOrgChange = async (value: string) => {
    const newOrgId = value === "none" ? null : parseInt(value);

    if (newOrgId === currentOrgId) {
      setIsOpen(false);
      return;
    }

    const org = organizations?.find((o) => o.id === newOrgId);
    const newOrgSlug = org?.slug ?? null;

    if (needsDomainChange(newOrgSlug)) {
      setPendingOrgId(newOrgId);
      setPendingOrgName(org?.name ?? null);
      setPendingOrgSlug(newOrgSlug);
      setIsOpen(false);
      setDomainDialogOpen(true);
      return;
    }

    if (needsWalletChange(newOrgId)) {
      setPendingOrgId(newOrgId);
      setPendingOrgName(org?.name ?? null);
      setPendingOrgSlug(newOrgSlug);
      setIsOpen(false);
      setWalletDialogOpen(true);
      return;
    }

    await saveOrgChange(newOrgId, undefined);
  };

  const saveOrgChange = async (
    newOrgId: number | null,
    newWalletId: number | null | undefined,
  ) => {
    setIsSaving(true);
    try {
      const payload: Record<string, unknown> = { organization_id: newOrgId };
      if (newWalletId !== undefined) {
        payload.wallet_id = newWalletId;
      }
      await api.put(`/api/admin/tenants/${tenantId}`, payload);
      toast({
        title: "Organization updated",
        description: `${tenantName} has been updated.`,
        variant: "success",
      });
      onUpdate();
    } catch (err) {
      toast({
        title: "Failed to update",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "error",
      });
    } finally {
      setIsSaving(false);
      setIsOpen(false);
      setWalletDialogOpen(false);
      setDomainDialogOpen(false);
      setPendingOrgId(null);
      setPendingOrgName(null);
      setPendingOrgSlug(null);
    }
  };

  const handleDomainConfirm = () => {
    if (needsWalletChange(pendingOrgId)) {
      setDomainDialogOpen(false);
      setWalletDialogOpen(true);
      return;
    }
    saveOrgChange(pendingOrgId, undefined);
  };

  const handleWalletConfirm = () => {
    saveOrgChange(pendingOrgId, selectedWalletId);
  };

  const formatDomain = (slug: string | null) => {
    if (slug) {
      return `${tenantName}.${slug}.api.corbits.dev`;
    }
    return `${tenantName}.api.corbits.dev`;
  };

  const availableWallets = [...(masterWallets ?? []), ...(newOrgWallets ?? [])];

  return (
    <>
      <Select.Root
        value={currentOrgId?.toString() ?? "none"}
        onValueChange={handleOrgChange}
        open={isOpen}
        onOpenChange={setIsOpen}
      >
        <Select.Trigger
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors focus:outline-none focus:ring-1 focus:ring-accent-8 ${
            isSaving || disabled
              ? "opacity-50 border-gray-6 bg-gray-3 text-gray-11 cursor-not-allowed"
              : currentOrgName
                ? "border-accent-7 bg-accent-3 text-accent-11 hover:bg-accent-4"
                : "border-gray-6 bg-gray-3 text-gray-10 hover:bg-gray-4 hover:text-gray-11"
          }`}
          disabled={isSaving || disabled}
          title={disabledReason ?? undefined}
        >
          <Select.Value>
            {isSaving ? "Saving..." : (currentOrgName ?? "Add org")}
          </Select.Value>
          <ChevronDownIcon className="h-3 w-3" />
        </Select.Trigger>

        <Select.Portal>
          <Select.Content
            className="overflow-hidden rounded-md border border-gray-6 bg-gray-2 shadow-lg"
            position="popper"
            sideOffset={4}
          >
            <Select.Viewport className="p-1">
              <Select.Item
                value="none"
                className="relative flex cursor-pointer select-none items-center rounded px-8 py-2 text-sm text-gray-11 outline-none hover:bg-gray-4 hover:text-gray-12 data-[highlighted]:bg-gray-4 data-[highlighted]:text-gray-12"
              >
                <Select.ItemText>No organization</Select.ItemText>
                <Select.ItemIndicator className="absolute left-2 inline-flex items-center">
                  <CheckIcon className="h-4 w-4" />
                </Select.ItemIndicator>
              </Select.Item>

              {organizations?.map((org) => (
                <Select.Item
                  key={org.id}
                  value={org.id.toString()}
                  className="relative flex cursor-pointer select-none items-center rounded px-8 py-2 text-sm text-gray-11 outline-none hover:bg-gray-4 hover:text-gray-12 data-[highlighted]:bg-gray-4 data-[highlighted]:text-gray-12"
                >
                  <Select.ItemText>{org.name}</Select.ItemText>
                  <Select.ItemIndicator className="absolute left-2 inline-flex items-center">
                    <CheckIcon className="h-4 w-4" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>

      <Dialog.Root open={walletDialogOpen} onOpenChange={setWalletDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-gray-6 bg-gray-2 p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <Dialog.Title className="text-lg font-semibold text-gray-12">
                Select Wallet
              </Dialog.Title>
              <Dialog.Close className="rounded p-1 text-gray-11 hover:bg-gray-4 hover:text-gray-12">
                <Cross2Icon className="h-4 w-4" />
              </Dialog.Close>
            </div>

            <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-800 bg-amber-900/20 p-3">
              <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0 text-amber-400 mt-0.5" />
              <p className="text-sm text-amber-300">
                The current wallet{" "}
                <span className="font-semibold text-white">
                  {currentWalletName}
                </span>{" "}
                doesn&apos;t belong to the{" "}
                <span className="font-semibold text-white">
                  {pendingOrgName ?? "new"}
                </span>{" "}
                org. Please select a wallet for this tenant.
              </p>
            </div>

            <div className="mt-4 space-y-2">
              <button
                onClick={() => setSelectedWalletId(null)}
                className={`flex w-full items-center justify-between rounded-md border px-4 py-3 text-left transition-colors ${
                  selectedWalletId === null
                    ? "border-accent-8 bg-accent-3"
                    : "border-gray-6 bg-gray-3 hover:bg-gray-4"
                }`}
              >
                <span className="text-sm text-gray-12">No wallet</span>
                {selectedWalletId === null && (
                  <CheckIcon className="h-4 w-4 text-accent-11" />
                )}
              </button>

              {availableWallets.map((wallet) => {
                const isMaster = wallet.organization_id === null;
                const isUnfunded = wallet.funding_status !== "funded";
                const isSelected = selectedWalletId === wallet.id;

                return (
                  <button
                    key={wallet.id}
                    onClick={() =>
                      !isUnfunded && setSelectedWalletId(wallet.id)
                    }
                    disabled={isUnfunded}
                    className={`flex w-full items-center justify-between rounded-md border px-4 py-3 text-left transition-colors ${
                      isSelected
                        ? "border-accent-8 bg-accent-3"
                        : isUnfunded
                          ? "border-gray-6 bg-gray-3 opacity-50 cursor-not-allowed"
                          : "border-gray-6 bg-gray-3 hover:bg-gray-4"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm ${isMaster ? "text-purple-400" : "text-gray-12"}`}
                      >
                        {wallet.name}
                      </span>
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
                    {isSelected && (
                      <CheckIcon className="h-4 w-4 text-accent-11" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setWalletDialogOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-gray-11 hover:bg-gray-4 hover:text-gray-12"
              >
                Cancel
              </button>
              <button
                onClick={handleWalletConfirm}
                disabled={isSaving}
                className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black shadow-button transition-colors hover:bg-white/90 disabled:opacity-50"
              >
                {isSaving ? "Saving..." : "Confirm"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={domainDialogOpen} onOpenChange={setDomainDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-gray-6 bg-gray-2 p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <Dialog.Title className="text-lg font-semibold text-gray-12">
                Domain Change
              </Dialog.Title>
              <Dialog.Close className="rounded p-1 text-gray-11 hover:bg-gray-4 hover:text-gray-12">
                <Cross2Icon className="h-4 w-4" />
              </Dialog.Close>
            </div>

            <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-800 bg-amber-900/20 p-3">
              <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0 text-amber-400 mt-0.5" />
              <p className="text-sm text-amber-300">
                Changing the organization will update the domain and trigger
                certificate reprovisioning.
              </p>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <p className="text-xs font-medium text-gray-11 mb-1">
                  Current domain
                </p>
                <code className="block rounded bg-gray-3 px-3 py-2 text-sm text-gray-12">
                  {formatDomain(currentOrgSlug)}
                </code>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-11 mb-1">
                  New domain
                </p>
                <code className="block rounded bg-gray-3 px-3 py-2 text-sm text-green-400">
                  {formatDomain(pendingOrgSlug)}
                </code>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setDomainDialogOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-gray-11 hover:bg-gray-4 hover:text-gray-12"
              >
                Cancel
              </button>
              <button
                onClick={handleDomainConfirm}
                disabled={isSaving}
                className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black shadow-button transition-colors hover:bg-white/90 disabled:opacity-50"
              >
                {isSaving ? "Saving..." : "Confirm"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
