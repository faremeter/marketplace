"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth/context";
import useSWR from "swr";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  CopyIcon,
  CheckIcon,
  ReloadIcon,
  CheckCircledIcon,
  CrossCircledIcon,
} from "@radix-ui/react-icons";
import { api } from "@/lib/api/client";
import {
  buildAddressOnlyConfig,
  isValidSolanaAddress,
  isValidEvmAddress,
} from "@/lib/wallet";
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

function WalletAddressModal({
  open,
  onOpenChange,
  onSave,
  isSaving,
  initialSolana = "",
  initialEvm = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (addresses: { solana?: string; evm?: string }) => void;
  isSaving: boolean;
  initialSolana?: string;
  initialEvm?: string;
}) {
  const [solanaAddress, setSolanaAddress] = useState(initialSolana);
  const [evmAddress, setEvmAddress] = useState(initialEvm);

  useEffect(() => {
    if (open) {
      setSolanaAddress(initialSolana);
      setEvmAddress(initialEvm);
    }
  }, [open, initialSolana, initialEvm]);

  const solanaValid = !solanaAddress || isValidSolanaAddress(solanaAddress);
  const evmValid = !evmAddress || isValidEvmAddress(evmAddress);
  const hasAtLeastOne = solanaAddress.trim() || evmAddress.trim();
  const canSave = solanaValid && evmValid && hasAtLeastOne;

  const handleSave = () => {
    onSave({
      solana: solanaAddress.trim() || undefined,
      evm: evmAddress.trim() || undefined,
    });
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-gray-6 bg-gray-1 p-6 shadow-xl max-h-[85vh] overflow-y-auto">
          <Dialog.Title className="text-lg font-semibold text-gray-12">
            Configure Wallet Addresses
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-gray-11">
            Enter the public wallet addresses where you want to receive
            payments.
          </Dialog.Description>

          <div className="mt-6 space-y-5">
            {/* Solana */}
            <div className="rounded-lg border border-gray-6 bg-gray-2 p-4">
              <label className="block text-sm font-medium text-gray-12 mb-2">
                Solana Address
              </label>
              <input
                type="text"
                value={solanaAddress}
                onChange={(e) => setSolanaAddress(e.target.value)}
                placeholder="e.g., 5ZZguz4NsSRFxGkHfYnS..."
                className={`w-full rounded-md border bg-gray-3 px-3 py-2 font-mono text-xs text-gray-12 placeholder:text-gray-8 focus:outline-none ${
                  solanaAddress && !solanaValid
                    ? "border-red-500 focus:border-red-500"
                    : "border-gray-6 focus:border-accent-8"
                }`}
              />
              {solanaAddress && !solanaValid && (
                <div className="flex items-center gap-2 text-xs mt-2">
                  <CrossCircledIcon className="h-3.5 w-3.5 text-red-400" />
                  <span className="text-red-400">Invalid Solana address</span>
                </div>
              )}
              {solanaAddress && solanaValid && (
                <div className="flex items-center gap-2 text-xs mt-2">
                  <CheckCircledIcon className="h-3.5 w-3.5 text-green-400" />
                  <span className="text-green-400">Valid address</span>
                </div>
              )}
            </div>

            {/* EVM */}
            <div className="rounded-lg border border-gray-6 bg-gray-2 p-4">
              <div className="mb-2">
                <label className="block text-sm font-medium text-gray-12">
                  EVM Address
                </label>
                <span className="text-xs text-gray-11">
                  Used for Base, Polygon, and Monad
                </span>
              </div>
              <input
                type="text"
                value={evmAddress}
                onChange={(e) => setEvmAddress(e.target.value)}
                placeholder="e.g., 0x1234..."
                className={`w-full rounded-md border bg-gray-3 px-3 py-2 font-mono text-xs text-gray-12 placeholder:text-gray-8 focus:outline-none ${
                  evmAddress && !evmValid
                    ? "border-red-500 focus:border-red-500"
                    : "border-gray-6 focus:border-accent-8"
                }`}
              />
              {evmAddress && !evmValid && (
                <div className="flex items-center gap-2 text-xs mt-2">
                  <CrossCircledIcon className="h-3.5 w-3.5 text-red-400" />
                  <span className="text-red-400">Invalid EVM address</span>
                </div>
              )}
              {evmAddress && evmValid && (
                <div className="flex items-center gap-2 text-xs mt-2">
                  <CheckCircledIcon className="h-3.5 w-3.5 text-green-400" />
                  <span className="text-green-400">Valid address</span>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <Dialog.Close asChild>
              <button className="rounded-md border border-gray-6 px-4 py-2 text-sm text-gray-11 hover:bg-gray-3">
                Cancel
              </button>
            </Dialog.Close>
            <button
              onClick={handleSave}
              disabled={!canSave || isSaving}
              className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black shadow-button transition-colors hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? "Saving..." : "Save Addresses"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function WalletSetup({
  onSave,
  isSaving,
}: {
  onSave: (addresses: { solana?: string; evm?: string }) => void;
  isSaving: boolean;
}) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <div className="rounded-lg border border-gray-6 bg-gray-2 p-8 text-center">
        <h2 className="mb-2 text-lg font-medium text-gray-12">
          No wallet configured
        </h2>
        <p className="mb-6 text-sm text-gray-11 max-w-md mx-auto">
          Add your wallet addresses to receive payments on Solana and EVM
          chains.
        </p>
        <button
          onClick={() => setShowModal(true)}
          className="rounded-md bg-white px-6 py-2.5 text-sm font-medium text-black shadow-button transition-colors hover:bg-white/90"
        >
          Add Wallet Addresses
        </button>
      </div>

      <WalletAddressModal
        open={showModal}
        onOpenChange={setShowModal}
        onSave={(addresses) => {
          onSave(addresses);
          setShowModal(false);
        }}
        isSaving={isSaving}
      />
    </>
  );
}

function WalletBalanceDisplay({
  walletData,
  balances,
  balancesLoading,
  mutateBalances,
  onEdit,
  isSaving,
  isOwner,
}: {
  walletData: WalletData;
  balances: WalletBalances | undefined;
  balancesLoading: boolean;
  mutateBalances: () => Promise<WalletBalances | undefined>;
  onEdit: (addresses: { solana?: string; evm?: string }) => void;
  isSaving: boolean;
  isOwner: boolean;
}) {
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const copyToClipboard = async (address: string) => {
    await navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await mutateBalances();
    } finally {
      setIsRefreshing(false);
    }
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

  // Filter to only show chains that have addresses
  const availableChains = CHAINS.filter((chain) => {
    const addr = getAddressForChain(chain.id);
    return addr !== null;
  });

  // Group by address type for display
  const solanaAddress = walletData.addresses.solana;
  const evmAddress = walletData.addresses.evm;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div />
        <div className="flex items-center gap-2">
          {isOwner && (
            <button
              onClick={() => setShowEditModal(true)}
              className="flex items-center gap-2 rounded-md border border-gray-6 px-3 py-2 text-sm text-gray-11 hover:bg-gray-3"
            >
              Edit Addresses
            </button>
          )}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 rounded-md border border-gray-6 px-3 py-2 text-sm text-gray-11 hover:bg-gray-3 disabled:opacity-50"
          >
            <ReloadIcon
              className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
            {isRefreshing ? "Refreshing..." : "Refresh Balances"}
          </button>
        </div>
      </div>

      {/* Addresses */}
      <div className="space-y-3">
        {solanaAddress && (
          <div className="rounded-lg border border-gray-6 bg-gray-2 p-4">
            <label className="block text-xs text-gray-11 mb-2">
              Solana Address
            </label>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md border border-gray-6 bg-gray-3 px-3 py-2 font-mono text-sm text-gray-12 overflow-hidden text-ellipsis">
                {solanaAddress}
              </code>
              <Tooltip.Provider delayDuration={200}>
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <button
                      onClick={() => copyToClipboard(solanaAddress)}
                      className="rounded-md border border-gray-6 p-2 text-gray-11 hover:bg-gray-3 hover:text-gray-12"
                    >
                      {copiedAddress === solanaAddress ? (
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
                      {copiedAddress === solanaAddress ? "Copied!" : "Copy"}
                      <Tooltip.Arrow className="fill-gray-12" />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              </Tooltip.Provider>
            </div>
          </div>
        )}

        {evmAddress && (
          <div className="rounded-lg border border-gray-6 bg-gray-2 p-4">
            <label className="block text-xs text-gray-11 mb-2">
              EVM Address{" "}
              <span className="text-gray-8">(Base, Polygon, Monad)</span>
            </label>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md border border-gray-6 bg-gray-3 px-3 py-2 font-mono text-sm text-gray-12 overflow-hidden text-ellipsis">
                {evmAddress}
              </code>
              <Tooltip.Provider delayDuration={200}>
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <button
                      onClick={() => copyToClipboard(evmAddress)}
                      className="rounded-md border border-gray-6 p-2 text-gray-11 hover:bg-gray-3 hover:text-gray-12"
                    >
                      {copiedAddress === evmAddress ? (
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
                      {copiedAddress === evmAddress ? "Copied!" : "Copy"}
                      <Tooltip.Arrow className="fill-gray-12" />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              </Tooltip.Provider>
            </div>
          </div>
        )}
      </div>

      {/* Balances Grid */}
      <div>
        <label className="block text-sm text-gray-11 mb-3">Balances</label>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {availableChains.map((chain) => {
            const chainBalances = getBalancesForChain(chain.id);
            return (
              <div
                key={chain.id}
                className="rounded-lg border border-gray-6 bg-gray-2 p-4"
              >
                <p className="text-sm font-medium text-gray-12 mb-3">
                  {chain.name}
                </p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-11">{chain.native}</span>
                    <span className="font-mono text-sm text-gray-12">
                      {balancesLoading ? (
                        <span className="inline-block h-4 w-12 animate-pulse rounded bg-gray-5" />
                      ) : (
                        (chainBalances?.native ?? "-")
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-11">USDC</span>
                    <span className="font-mono text-sm text-gray-12">
                      {balancesLoading ? (
                        <span className="inline-block h-4 w-12 animate-pulse rounded bg-gray-5" />
                      ) : chainBalances?.usdc ? (
                        `$${chainBalances.usdc}`
                      ) : (
                        "-"
                      )}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <WalletAddressModal
        open={showEditModal}
        onOpenChange={setShowEditModal}
        onSave={(addresses) => {
          onEdit(addresses);
          setShowEditModal(false);
        }}
        isSaving={isSaving}
        initialSolana={solanaAddress || ""}
        initialEvm={evmAddress || ""}
      />
    </div>
  );
}

export default function WalletsPage() {
  const { currentOrg, user } = useAuth();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

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

  const handleSaveWallet = async (addresses: {
    solana?: string;
    evm?: string;
  }) => {
    if (!currentOrg) return;
    setIsSaving(true);
    try {
      const walletConfig = buildAddressOnlyConfig(addresses);
      await api.put(`/api/organizations/${currentOrg.id}/wallet`, {
        wallet_config: walletConfig,
      });
      await mutateWallet();
      await mutateBalances();
      toast({
        title: "Wallet configured",
        description: "Your wallet addresses have been saved successfully.",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to save wallet",
        variant: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!currentOrg) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-11">Select an organization to view wallets</p>
      </div>
    );
  }

  const showSetup = !walletData?.hasWallet;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-12">
          Organization Wallet
        </h1>
        <p className="text-sm text-gray-11">
          Manage crypto wallets for {currentOrg.name}
        </p>
      </div>

      {walletLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-6 border-t-accent-9" />
        </div>
      ) : showSetup ? (
        isOwner ? (
          <WalletSetup onSave={handleSaveWallet} isSaving={isSaving} />
        ) : (
          <div className="rounded-lg border border-gray-6 bg-gray-2 p-8 text-center">
            <h2 className="mb-2 text-lg font-medium text-gray-12">
              No wallet configured
            </h2>
            <p className="text-sm text-amber-400">
              Only organization owners can configure wallets.
            </p>
          </div>
        )
      ) : (
        <WalletBalanceDisplay
          walletData={walletData as WalletData}
          balances={balances}
          balancesLoading={balancesLoading}
          mutateBalances={mutateBalances}
          onEdit={handleSaveWallet}
          isSaving={isSaving}
          isOwner={isOwner ?? false}
        />
      )}
    </div>
  );
}
