"use client";

import { useState } from "react";
import * as Select from "@radix-ui/react-select";
import { ChevronDownIcon, CheckIcon } from "@radix-ui/react-icons";
import useSWR from "swr";
import { api } from "@/lib/api/client";
import { useToast } from "@/components/ui/toast";

interface Wallet {
  id: number;
  name: string;
  funding_status: string;
}

interface InlineWalletSelectProps {
  tenantName: string;
  organizationId: number;
  currentWalletId: number | null;
  currentWalletName: string | null;
  apiEndpoint: string;
  onUpdate: () => void;
}

export function InlineWalletSelect({
  tenantName,
  organizationId,
  currentWalletId,
  currentWalletName,
  apiEndpoint,
  onUpdate,
}: InlineWalletSelectProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const { data: wallets } = useSWR(
    isOpen ? `/api/wallets/organization/${organizationId}` : null,
    api.get<Wallet[]>,
  );

  const handleChange = async (value: string) => {
    const newWalletId = value === "none" ? null : parseInt(value);

    if (newWalletId === currentWalletId) {
      setIsOpen(false);
      return;
    }

    setIsSaving(true);
    try {
      await api.put(apiEndpoint, {
        wallet_id: newWalletId,
      });
      toast({
        title: "Wallet updated",
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
    }
  };

  const getStatusColor = () => {
    if (isSaving) return "opacity-50 border-gray-6 bg-gray-3 text-gray-11";
    if (!currentWalletId)
      return "border-red-700 bg-red-900/30 text-red-400 hover:bg-red-900/40";
    return "border-accent-7 bg-accent-3 text-accent-11 hover:bg-accent-4";
  };

  return (
    <Select.Root
      value={currentWalletId?.toString() ?? "none"}
      onValueChange={handleChange}
      open={isOpen}
      onOpenChange={setIsOpen}
    >
      <Select.Trigger
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors focus:outline-none focus:ring-1 focus:ring-accent-8 ${getStatusColor()}`}
        disabled={isSaving}
      >
        <Select.Value>
          {isSaving ? "Saving..." : (currentWalletName ?? "No wallet")}
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
            {wallets?.length === 0 && (
              <div className="px-8 py-2 text-sm text-gray-11">
                No wallets available
              </div>
            )}

            {wallets?.map((wallet) => {
              const isUnfunded = wallet.funding_status !== "funded";
              return (
                <Select.Item
                  key={wallet.id}
                  value={wallet.id.toString()}
                  disabled={isUnfunded}
                  className="relative flex w-full cursor-pointer select-none items-center justify-between gap-4 rounded px-8 py-2 text-sm text-gray-12 outline-none hover:bg-gray-4 data-[highlighted]:bg-gray-4 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[disabled]:hover:bg-transparent"
                >
                  <Select.ItemIndicator className="absolute left-2 inline-flex items-center">
                    <CheckIcon className="h-4 w-4 text-accent-11" />
                  </Select.ItemIndicator>
                  <Select.ItemText>{wallet.name}</Select.ItemText>
                  {isUnfunded && (
                    <span className="rounded-full border border-yellow-800 bg-yellow-900/30 px-2 py-0.5 text-xs text-yellow-400">
                      unfunded
                    </span>
                  )}
                </Select.Item>
              );
            })}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
