"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Cross2Icon,
  ExclamationTriangleIcon,
  CheckCircledIcon,
} from "@radix-ui/react-icons";
import Link from "next/link";
import { api, ApiError } from "@/lib/api/client";
import { useToast } from "@/components/ui/toast";

interface GoLiveButtonProps {
  tenant: {
    id: number;
    name: string;
    backend_url: string;
    wallet_id: number | null;
    wallet_funding_status: string | null;
  };
  orgId: number;
  onActivate: () => void;
}

export function GoLiveButton({ tenant, orgId, onActivate }: GoLiveButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const handleActivate = async () => {
    setIsActivating(true);
    try {
      await api.post(
        `/api/organizations/${orgId}/tenants/${tenant.id}/activate`,
        {},
      );
      toast({
        title: "Activation started",
        description: `${tenant.name} is being activated.`,
        variant: "success",
      });
      setDialogOpen(false);
      onActivate();
      router.push(`/proxies/${tenant.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.data) {
        const data = err.data as { error?: string };
        toast({
          title: "Activation failed",
          description: data.error || "Failed to activate proxy",
          variant: "error",
        });
      } else {
        toast({
          title: "Error",
          description:
            err instanceof Error ? err.message : "Failed to activate proxy",
          variant: "error",
        });
      }
    } finally {
      setIsActivating(false);
    }
  };

  const canActivate =
    tenant.backend_url &&
    tenant.wallet_id &&
    tenant.wallet_funding_status === "funded";

  return (
    <>
      <button
        onClick={() => setDialogOpen(true)}
        className="rounded-md border border-brand-orange bg-gray-2 px-3 py-1.5 text-sm font-semibold text-brand-orange transition-colors hover:bg-brand-orange hover:text-white"
      >
        Go Live
      </button>

      <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-gray-6 bg-gray-1 p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <Dialog.Title className="text-lg font-semibold text-gray-12">
                Go Live
              </Dialog.Title>
              <Dialog.Close className="rounded p-1 text-gray-11 hover:bg-gray-4 hover:text-gray-12">
                <Cross2Icon className="h-4 w-4" />
              </Dialog.Close>
            </div>

            <div className="space-y-4">
              {!tenant.backend_url ? (
                <div className="rounded-md border border-red-800 bg-red-900/20 p-3">
                  <div className="flex items-start gap-2">
                    <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 text-red-400" />
                    <div>
                      <p className="text-sm font-medium text-red-400">
                        Backend URL Required
                      </p>
                      <p className="mt-1 text-sm text-gray-11">
                        A backend URL must be configured before going live.{" "}
                        <Link
                          href={`/proxies/${tenant.id}?tab=settings`}
                          className="text-brand-orange hover:underline"
                        >
                          Go to Settings
                        </Link>{" "}
                        and add your backend URL.
                      </p>
                    </div>
                  </div>
                </div>
              ) : !tenant.wallet_id ? (
                <div className="rounded-md border border-red-800 bg-red-900/20 p-3">
                  <div className="flex items-start gap-2">
                    <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 text-red-400" />
                    <div>
                      <p className="text-sm font-medium text-red-400">
                        Wallet Required
                      </p>
                      <p className="mt-1 text-sm text-gray-11">
                        A wallet must be assigned before going live.{" "}
                        <Link
                          href={`/proxies/${tenant.id}?tab=settings`}
                          className="text-brand-orange hover:underline"
                        >
                          Go to Settings
                        </Link>{" "}
                        and select a wallet.
                      </p>
                    </div>
                  </div>
                </div>
              ) : tenant.wallet_funding_status !== "funded" ? (
                <div className="rounded-md border border-yellow-800 bg-yellow-900/20 p-3">
                  <div className="flex items-start gap-2">
                    <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 text-yellow-400" />
                    <div>
                      <p className="text-sm font-medium text-yellow-400">
                        Wallet Not Funded
                      </p>
                      <p className="mt-1 text-sm text-gray-11">
                        Your wallet must be funded before going live.{" "}
                        <Link
                          href="/wallets"
                          className="text-brand-orange hover:underline"
                        >
                          Fund your wallet
                        </Link>
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="rounded-md border border-green-800 bg-green-900/20 p-3">
                    <div className="flex items-start gap-2">
                      <CheckCircledIcon className="mt-0.5 h-4 w-4 text-green-400" />
                      <p className="text-sm text-gray-11">
                        Wallet is funded and ready
                      </p>
                    </div>
                  </div>

                  <p className="text-sm text-gray-11">
                    Are you sure you want to go live? Once activated, your proxy
                    will start accepting requests.
                  </p>
                </>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDialogOpen(false)}
                  className="rounded-md border border-gray-6 px-4 py-2 text-sm text-gray-11 hover:bg-gray-3"
                >
                  Cancel
                </button>
                {canActivate && (
                  <button
                    onClick={handleActivate}
                    disabled={isActivating}
                    className="inline-flex items-center gap-2 rounded-md bg-brand-orange px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-orange/90 disabled:opacity-50"
                  >
                    Go Live
                    {isActivating ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />
                    ) : (
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M13 7l5 5m0 0l-5 5m5-5H6"
                        />
                      </svg>
                    )}
                  </button>
                )}
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
