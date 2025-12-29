"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as Select from "@radix-ui/react-select";
import {
  Cross2Icon,
  PlusIcon,
  MinusIcon,
  CheckCircledIcon,
  CrossCircledIcon,
  ChevronDownIcon,
  CheckIcon,
  EyeOpenIcon,
  EyeClosedIcon,
} from "@radix-ui/react-icons";
import { api, ApiError } from "@/lib/api/client";
import { SCHEME_OPTIONS } from "@/lib/types/api";
import { useToast } from "@/components/ui/toast";
import { sanitizeProxyName } from "@/lib/proxy-name";
import useSWR from "swr";
import { refreshOnboardingStatus } from "@/lib/hooks/use-onboarding";

interface Wallet {
  id: number;
  name: string;
  funding_status: string;
}

interface CreateUserTenantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  organizationId: number;
}

export function CreateUserTenantDialog({
  open,
  onOpenChange,
  onSuccess,
  organizationId,
}: CreateUserTenantDialogProps) {
  const { toast } = useToast();

  const { data: wallets } = useSWR<Wallet[]>(
    open ? `/api/wallets/organization/${organizationId}` : null,
    api.get<Wallet[]>,
  );

  const [name, setName] = useState("");
  const [walletId, setWalletId] = useState<number | null>(null);
  const [backendUrl, setBackendUrl] = useState("");
  const [authHeader, setAuthHeader] = useState("");
  const [authValue, setAuthValue] = useState("");
  const [defaultPrice, setDefaultPrice] = useState("0.01");
  const [defaultScheme, setDefaultScheme] = useState("exact");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nameAvailable, setNameAvailable] = useState<boolean | null>(null);
  const [isCheckingName, setIsCheckingName] = useState(false);
  const [showAuthValue, setShowAuthValue] = useState(true);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const checkTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isDirty = useCallback(() => {
    return (
      name.trim() !== "" ||
      walletId !== null ||
      backendUrl.trim() !== "" ||
      authHeader.trim() !== "" ||
      authValue.trim() !== "" ||
      defaultPrice !== "0.01" ||
      defaultScheme !== "exact"
    );
  }, [
    name,
    walletId,
    backendUrl,
    authHeader,
    authValue,
    defaultPrice,
    defaultScheme,
  ]);

  const attemptClose = useCallback(() => {
    if (isDirty()) {
      setShowDiscardConfirm(true);
    } else {
      onOpenChange(false);
    }
  }, [isDirty, onOpenChange]);

  useEffect(() => {
    if (!name.trim()) {
      setNameAvailable(null);
      return;
    }

    setIsCheckingName(true);
    setNameAvailable(null);

    if (checkTimeoutRef.current) {
      clearTimeout(checkTimeoutRef.current);
    }

    checkTimeoutRef.current = setTimeout(async () => {
      try {
        const sanitized = sanitizeProxyName(name);
        if (!sanitized) {
          setNameAvailable(null);
          setIsCheckingName(false);
          return;
        }
        const result = await api.get<{ available: boolean }>(
          `/api/organizations/${organizationId}/tenants/check-name?name=${encodeURIComponent(sanitized)}`,
        );
        setNameAvailable(result.available);
      } catch {
        setNameAvailable(null);
      } finally {
        setIsCheckingName(false);
      }
    }, 500);

    return () => {
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
      }
    };
  }, [name, organizationId]);

  const resetForm = () => {
    setName("");
    setWalletId(null);
    setBackendUrl("");
    setAuthHeader("");
    setAuthValue("");
    setDefaultPrice("0.01");
    setDefaultScheme("exact");
    setError("");
    setNameAvailable(null);
    setIsCheckingName(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      attemptClose();
      return;
    }
    onOpenChange(newOpen);
  };

  const confirmDiscard = () => {
    setShowDiscardConfirm(false);
    resetForm();
    onOpenChange(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const trimmedName = name.trim();
    const trimmedUrl = backendUrl.trim();
    const trimmedHeader = authHeader.trim();
    const trimmedValue = authValue.trim();
    const price = parseFloat(defaultPrice) || 0;

    if (!trimmedName) {
      setError("Name is required");
      return;
    }
    if (trimmedName.length > 63) {
      setError("Name must be 63 characters or less");
      return;
    }
    if (nameAvailable === false) {
      setError("This name is already taken");
      return;
    }
    if (!trimmedUrl) {
      setError("Backend URL is required");
      return;
    }
    if (trimmedUrl.length > 2048) {
      setError("Backend URL is too long (max 2048 characters)");
      return;
    }
    try {
      const url = new URL(trimmedUrl);
      if (!["http:", "https:"].includes(url.protocol)) {
        setError("Backend URL must use http or https");
        return;
      }
    } catch {
      setError("Invalid backend URL");
      return;
    }
    if (trimmedHeader.length > 256) {
      setError("Auth header is too long (max 256 characters)");
      return;
    }
    if (trimmedValue.length > 4096) {
      setError("Auth value is too long (max 4096 characters)");
      return;
    }
    if (!walletId) {
      setError("Wallet is required");
      return;
    }
    if (price <= 0) {
      setError("Price must be greater than 0");
      return;
    }
    if (price > 100) {
      setError("Price must be $100 or less");
      return;
    }

    setIsSubmitting(true);

    // Recheck name availability before submitting
    try {
      const sanitized = sanitizeProxyName(name);
      const result = await api.get<{ available: boolean }>(
        `/api/organizations/${organizationId}/tenants/check-name?name=${encodeURIComponent(sanitized)}`,
      );
      if (!result.available) {
        setNameAvailable(false);
        setError("This name was just taken. Please choose another.");
        setIsSubmitting(false);
        return;
      }
    } catch {
      // Continue with submission if check fails
    }

    try {
      await api.post(`/api/organizations/${organizationId}/tenants`, {
        name: name.trim(),
        wallet_id: walletId,
        backend_url: backendUrl.trim(),
        upstream_auth_header: authHeader.trim() || null,
        upstream_auth_value: authValue.trim() || null,
        default_price_usdc: Math.round(
          (parseFloat(defaultPrice) || 0) * 1_000_000,
        ),
        default_scheme: defaultScheme,
      });
      resetForm();
      onOpenChange(false);
      toast({
        title: "Proxy created",
        description: `${name.trim()} has been created successfully.`,
        variant: "success",
      });
      refreshOnboardingStatus(organizationId);
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError && err.data) {
        const data = err.data as { error?: string };
        setError(data.error || "Failed to create proxy");
      } else {
        setError(err instanceof Error ? err.message : "Failed to create proxy");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 max-h-[85vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-gray-6 bg-gray-1 p-6 shadow-xl"
          onInteractOutside={(e) => {
            if (isDirty()) {
              e.preventDefault();
              setShowDiscardConfirm(true);
            }
          }}
          onEscapeKeyDown={(e) => {
            if (isDirty()) {
              e.preventDefault();
              setShowDiscardConfirm(true);
            }
          }}
        >
          <div className="mb-6 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-gray-12">
              New Proxy
            </Dialog.Title>
            <button
              type="button"
              onClick={attemptClose}
              className="rounded p-1 text-gray-11 hover:bg-gray-4 hover:text-gray-12"
            >
              <Cross2Icon className="h-4 w-4" />
            </button>
          </div>

          {/* URL Preview */}
          <div className="mb-6 rounded-md border border-gray-6 bg-gray-2 px-4 py-3 text-center">
            <p className="text-xs text-gray-11 mb-1">
              Your proxy will be available at
            </p>
            <div className="flex items-center justify-center gap-2">
              <code className="font-mono text-sm">
                {name.trim() ? (
                  <span className="text-gray-12">
                    {sanitizeProxyName(name) || "<name>"}.api.corbits.dev
                  </span>
                ) : (
                  <>
                    <span className="text-gray-9">&lt;name&gt;</span>
                    <span className="text-gray-12">.api.corbits.dev</span>
                  </>
                )}
              </code>
              {name.trim() && (
                <>
                  {isCheckingName ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-6 border-t-gray-11" />
                  ) : nameAvailable === true ? (
                    <CheckCircledIcon className="h-4 w-4 text-green-500" />
                  ) : nameAvailable === false ? (
                    <CrossCircledIcon className="h-4 w-4 text-red-500" />
                  ) : null}
                </>
              )}
            </div>
            {name.trim() && nameAvailable === false && !isCheckingName && (
              <p className="mt-1 text-xs text-red-400">
                This name is already taken
              </p>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Info */}
            <section>
              <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-11">
                Basic Info
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-sm text-gray-11">
                    Proxy Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="my-api-proxy"
                    className="w-full rounded-md border border-gray-6 bg-gray-2 px-3 py-2 text-sm text-gray-12 placeholder-gray-9 focus:border-accent-8 focus:outline-none focus:ring-1 focus:ring-accent-8"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm text-gray-11">
                    PayTo Wallet <span className="text-red-400">*</span>
                  </label>
                  <Select.Root
                    value={walletId?.toString()}
                    onValueChange={(value) => setWalletId(Number(value))}
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
                          {!wallets?.length && (
                            <div className="px-3 py-2 text-sm text-gray-11">
                              No wallets available
                            </div>
                          )}
                          {wallets?.map((wallet) => {
                            const isUnfunded =
                              wallet.funding_status !== "funded";
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
                  {!wallets?.length && (
                    <p className="mt-1 text-xs text-gray-9">
                      No wallets available. Create a wallet first.
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
                    <div className="relative">
                      <input
                        type={showAuthValue ? "text" : "password"}
                        value={authValue}
                        onChange={(e) => setAuthValue(e.target.value)}
                        placeholder="Bearer token..."
                        className="w-full rounded-md border border-gray-6 bg-gray-2 px-3 py-2 pr-9 text-sm text-gray-12 placeholder-gray-9 focus:border-accent-8 focus:outline-none focus:ring-1 focus:ring-accent-8"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAuthValue(!showAuthValue)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-11 hover:text-gray-12"
                      >
                        {showAuthValue ? (
                          <EyeOpenIcon className="h-4 w-4" />
                        ) : (
                          <EyeClosedIcon className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
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
                  <Select.Root
                    value={defaultScheme}
                    onValueChange={setDefaultScheme}
                  >
                    <Select.Trigger className="flex w-full items-center justify-between rounded-md border border-gray-6 bg-gray-2 px-3 py-2 text-sm text-gray-12 focus:border-accent-8 focus:outline-none focus:ring-1 focus:ring-accent-8">
                      <Select.Value />
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
                          {SCHEME_OPTIONS.map((opt) => (
                            <Select.Item
                              key={opt.value}
                              value={opt.value}
                              className="relative flex cursor-pointer select-none items-center rounded px-8 py-2 text-sm outline-none hover:bg-gray-4 data-[highlighted]:bg-gray-4"
                            >
                              <Select.ItemIndicator className="absolute left-2 inline-flex items-center">
                                <CheckIcon className="h-4 w-4 text-accent-11" />
                              </Select.ItemIndicator>
                              <Select.ItemText>{opt.label}</Select.ItemText>
                            </Select.Item>
                          ))}
                        </Select.Viewport>
                      </Select.Content>
                    </Select.Portal>
                  </Select.Root>
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
                onClick={attemptClose}
                className="rounded-md border border-gray-6 px-4 py-2 text-sm text-gray-11 hover:bg-gray-3"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-black shadow-button transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting && (
                  <svg
                    className="h-4 w-4 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                )}
                {isSubmitting ? "Creating..." : "Create Proxy"}
              </button>
            </div>
          </form>

          <AlertDialog.Root
            open={showDiscardConfirm}
            onOpenChange={setShowDiscardConfirm}
          >
            <AlertDialog.Portal>
              <AlertDialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
              <AlertDialog.Content className="fixed left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border border-gray-6 bg-gray-2 p-6 shadow-xl z-50">
                <AlertDialog.Title className="text-lg font-semibold text-gray-12">
                  Discard changes?
                </AlertDialog.Title>
                <AlertDialog.Description className="mt-2 text-sm text-gray-11">
                  You have unsaved changes. Are you sure you want to close this
                  dialog? Your changes will be lost.
                </AlertDialog.Description>
                <div className="mt-6 flex justify-end gap-3">
                  <AlertDialog.Cancel asChild>
                    <button className="rounded-md border border-gray-6 px-4 py-2 text-sm text-gray-11 hover:bg-gray-3">
                      Keep editing
                    </button>
                  </AlertDialog.Cancel>
                  <AlertDialog.Action asChild>
                    <button
                      onClick={confirmDiscard}
                      className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                    >
                      Discard
                    </button>
                  </AlertDialog.Action>
                </div>
              </AlertDialog.Content>
            </AlertDialog.Portal>
          </AlertDialog.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
