"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/context";
import useSWR from "swr";
import * as Tabs from "@radix-ui/react-tabs";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as Tooltip from "@radix-ui/react-tooltip";
import { CopyIcon, CheckIcon, ReloadIcon } from "@radix-ui/react-icons";
import { api } from "@/lib/api/client";
import { generateWalletConfig } from "@/lib/wallet";
import { useToast } from "@/components/ui/toast";

interface WalletData {
  hasWallet: boolean;
  addresses: {
    solana: string | null;
    evm: string | null;
  };
}

interface ChainBalances {
  native: string;
  usdc: string;
}

interface WalletBalances {
  solana: ChainBalances;
  base: ChainBalances;
  polygon: ChainBalances;
  monad: ChainBalances;
}

const CHAINS = [
  { id: "solana", name: "Solana", native: "SOL", color: "purple" },
  { id: "base", name: "Base", native: "ETH", color: "blue" },
  { id: "polygon", name: "Polygon", native: "MATIC", color: "violet" },
  { id: "monad", name: "Monad", native: "MON", color: "green" },
] as const;

export default function WalletsPage() {
  const { currentOrg, user } = useAuth();
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  const currentRole = user?.organizations.find(
    (o) => o.id === currentOrg?.id,
  )?.role;
  const isOwner = currentRole === "owner" || user?.is_admin;

  const {
    data: walletData,
    isLoading: walletLoading,
    mutate: mutateWallet,
  } = useSWR<WalletData>(
    currentOrg ? `/api/organizations/${currentOrg.id}/wallet` : null,
    api.get,
  );

  const {
    data: balances,
    isLoading: balancesLoading,
    mutate: mutateBalances,
  } = useSWR<WalletBalances>(
    currentOrg && walletData?.hasWallet
      ? `/api/organizations/${currentOrg.id}/wallet/balances`
      : null,
    api.get,
    { refreshInterval: 60000 },
  );

  const handleGenerateWallet = async (regenerate = false) => {
    if (!currentOrg) return;
    setIsGenerating(true);
    try {
      const walletConfig = generateWalletConfig();
      await api.put(`/api/organizations/${currentOrg.id}/wallet`, {
        wallet_config: walletConfig,
      });
      await mutateWallet();
      await mutateBalances();
      toast({
        title: regenerate ? "Wallet regenerated" : "Wallet created",
        description: "Your organization wallet has been set up successfully.",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to generate wallet",
        variant: "error",
      });
    } finally {
      setIsGenerating(false);
      setShowRegenerateDialog(false);
    }
  };

  const copyToClipboard = async (address: string) => {
    await navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const getAddressForChain = (chainId: string) => {
    if (!walletData?.addresses) return null;
    if (chainId === "solana") return walletData.addresses.solana;
    return walletData.addresses.evm;
  };

  const getBalancesForChain = (chainId: string): ChainBalances | null => {
    if (!balances) return null;
    return balances[chainId as keyof WalletBalances];
  };

  if (!currentOrg) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-11">Select an organization to view wallets</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-12">
            Organization Wallet
          </h1>
          <p className="text-sm text-gray-11">
            Manage crypto wallets for {currentOrg.name}
          </p>
        </div>
        {walletData?.hasWallet && (
          <button
            onClick={() => mutateBalances()}
            disabled={balancesLoading}
            className="flex items-center gap-2 rounded-md border border-gray-6 px-3 py-2 text-sm text-gray-11 hover:bg-gray-3 disabled:opacity-50"
          >
            <ReloadIcon
              className={`h-4 w-4 ${balancesLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        )}
      </div>

      {walletLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-6 border-t-accent-9" />
        </div>
      ) : !walletData?.hasWallet ? (
        <div className="rounded-lg border border-gray-6 bg-gray-2 p-8 text-center">
          <h2 className="mb-2 text-lg font-medium text-gray-12">
            No wallet configured
          </h2>
          <p className="mb-6 text-sm text-gray-11">
            Generate a wallet to receive payments for your organization.
          </p>
          {isOwner ? (
            <button
              onClick={() => handleGenerateWallet(false)}
              disabled={isGenerating}
              className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black shadow-button transition-colors hover:bg-white/90 disabled:opacity-50"
            >
              {isGenerating ? "Generating..." : "Generate Wallet"}
            </button>
          ) : (
            <p className="text-sm text-amber-400">
              Only organization owners can generate wallets.
            </p>
          )}
        </div>
      ) : (
        <Tabs.Root defaultValue="solana" className="space-y-4">
          <Tabs.List className="flex gap-1 rounded-lg border border-gray-6 bg-gray-2 p-1">
            {CHAINS.map((chain) => (
              <Tabs.Trigger
                key={chain.id}
                value={chain.id}
                className="flex-1 rounded-md px-4 py-2 text-sm font-medium text-gray-11 transition-colors hover:text-gray-12 data-[state=active]:bg-gray-4 data-[state=active]:text-gray-12"
              >
                {chain.name}
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          {CHAINS.map((chain) => {
            const address = getAddressForChain(chain.id);
            const chainBalances = getBalancesForChain(chain.id);

            return (
              <Tabs.Content key={chain.id} value={chain.id}>
                <div className="rounded-lg border border-gray-6 bg-gray-2 p-6 space-y-6">
                  <div>
                    <label className="block text-sm text-gray-11 mb-2">
                      {chain.name} Address
                    </label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 rounded-md border border-gray-6 bg-gray-3 px-3 py-2 font-mono text-sm text-gray-12 overflow-hidden text-ellipsis">
                        {address || "—"}
                      </code>
                      {address && (
                        <Tooltip.Provider delayDuration={200}>
                          <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                              <button
                                onClick={() => copyToClipboard(address)}
                                className="rounded-md border border-gray-6 p-2 text-gray-11 hover:bg-gray-3 hover:text-gray-12"
                              >
                                {copiedAddress === address ? (
                                  <CheckIcon className="h-4 w-4 text-green-400" />
                                ) : (
                                  <CopyIcon className="h-4 w-4" />
                                )}
                              </button>
                            </Tooltip.Trigger>
                            <Tooltip.Portal>
                              <Tooltip.Content
                                className="rounded bg-gray-12 px-2 py-1 text-xs text-gray-1"
                                sideOffset={5}
                              >
                                {copiedAddress === address
                                  ? "Copied!"
                                  : "Copy address"}
                                <Tooltip.Arrow className="fill-gray-12" />
                              </Tooltip.Content>
                            </Tooltip.Portal>
                          </Tooltip.Root>
                        </Tooltip.Provider>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-11 mb-3">
                      Balances
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="rounded-lg border border-gray-6 bg-gray-3 p-4">
                        <p className="text-xs text-gray-11 mb-1">
                          {chain.native}
                        </p>
                        <p className="text-xl font-semibold text-gray-12">
                          {balancesLoading ? (
                            <span className="inline-block h-6 w-20 animate-pulse rounded bg-gray-5" />
                          ) : (
                            (chainBalances?.native ?? "—")
                          )}
                        </p>
                      </div>
                      <div className="rounded-lg border border-gray-6 bg-gray-3 p-4">
                        <p className="text-xs text-gray-11 mb-1">USDC</p>
                        <p className="text-xl font-semibold text-gray-12">
                          {balancesLoading ? (
                            <span className="inline-block h-6 w-20 animate-pulse rounded bg-gray-5" />
                          ) : chainBalances?.usdc ? (
                            `$${chainBalances.usdc}`
                          ) : (
                            "—"
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </Tabs.Content>
            );
          })}

          {isOwner && (
            <div className="rounded-lg border border-amber-800/50 bg-amber-900/20 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-amber-400">
                    Regenerate Wallet
                  </p>
                  <p className="text-xs text-amber-400/70">
                    This will create new wallet addresses. Make sure to update
                    any existing configurations.
                  </p>
                </div>
                <AlertDialog.Root
                  open={showRegenerateDialog}
                  onOpenChange={setShowRegenerateDialog}
                >
                  <AlertDialog.Trigger asChild>
                    <button className="rounded-md border border-amber-800 px-3 py-1.5 text-sm text-amber-400 hover:bg-amber-900/30">
                      Regenerate
                    </button>
                  </AlertDialog.Trigger>
                  <AlertDialog.Portal>
                    <AlertDialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
                    <AlertDialog.Content className="fixed left-1/2 top-1/2 max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-gray-6 bg-gray-1 p-6 shadow-xl">
                      <AlertDialog.Title className="text-lg font-semibold text-gray-12">
                        Regenerate Wallet?
                      </AlertDialog.Title>
                      <AlertDialog.Description className="mt-2 text-sm text-gray-11">
                        This will generate completely new wallet addresses. Any
                        funds in the current wallets will not be accessible from
                        the new addresses. Make sure you have transferred all
                        funds before proceeding.
                      </AlertDialog.Description>
                      <div className="mt-6 flex justify-end gap-3">
                        <AlertDialog.Cancel asChild>
                          <button className="rounded-md border border-gray-6 px-4 py-2 text-sm text-gray-11 hover:bg-gray-3">
                            Cancel
                          </button>
                        </AlertDialog.Cancel>
                        <AlertDialog.Action asChild>
                          <button
                            onClick={() => handleGenerateWallet(true)}
                            disabled={isGenerating}
                            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            {isGenerating ? "Regenerating..." : "Regenerate"}
                          </button>
                        </AlertDialog.Action>
                      </div>
                    </AlertDialog.Content>
                  </AlertDialog.Portal>
                </AlertDialog.Root>
              </div>
            </div>
          )}
        </Tabs.Root>
      )}
    </div>
  );
}
