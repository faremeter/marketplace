"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as Select from "@radix-ui/react-select";
import * as Checkbox from "@radix-ui/react-checkbox";
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
  InfoCircledIcon,
} from "@radix-ui/react-icons";
import { api, ApiError } from "@/lib/api/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SCHEME_OPTIONS, MIN_PRICE_USD, MAX_PRICE_USD } from "@/lib/types/api";
import { useToast } from "@/components/ui/toast";
import { sanitizeProxyName } from "@/lib/proxy-name";
import useSWR from "swr";
import { refreshOnboardingStatus } from "@/lib/hooks/use-onboarding";
import {
  type HeaderType,
  type ValueFormat,
  isBlockedHeader,
  composeFinalHeader,
  composeFinalValue,
  maskToken,
} from "@/lib/auth-header";
import { type WalletConfig } from "@/lib/wallet";

interface Wallet {
  id: number;
  name: string;
  funding_status: string;
  wallet_config: WalletConfig;
}

interface CreateUserTenantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  organizationId: number;
  organizationSlug: string;
  isFirstProxy?: boolean;
}

export function CreateUserTenantDialog({
  open,
  onOpenChange,
  onSuccess,
  organizationId,
  organizationSlug,
  isFirstProxy = false,
}: CreateUserTenantDialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isCelebrating, setIsCelebrating] = useState(false);

  useEffect(() => {
    if (isCelebrating) {
      const timer = setTimeout(() => {
        import("@hiseb/confetti").then(({ default: confetti }) => {
          const positions = [
            { x: window.innerWidth * 0.5, y: window.innerHeight * 0.4 },
            { x: window.innerWidth * 0.3, y: window.innerHeight * 0.5 },
            { x: window.innerWidth * 0.7, y: window.innerHeight * 0.5 },
          ];
          positions.forEach((position, i) => {
            setTimeout(
              () => confetti({ position, count: 80, velocity: 180 }),
              i * 150,
            );
          });
        });
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isCelebrating]);

  const { data: wallets } = useSWR<Wallet[]>(
    open ? `/api/wallets/organization/${organizationId}` : null,
    api.get<Wallet[]>,
  );

  const [name, setName] = useState("");
  const [walletId, setWalletId] = useState<number | null>(null);
  const [backendUrl, setBackendUrl] = useState("");
  const [headerType, setHeaderType] = useState<HeaderType>("Authorization");
  const [customHeader, setCustomHeader] = useState("");
  const [valueFormat, setValueFormat] = useState<ValueFormat>("bearer");
  const [customPrefix, setCustomPrefix] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [defaultPrice, setDefaultPrice] = useState("0.01");
  const [defaultScheme, setDefaultScheme] = useState("exact");
  const [registerOnly, setRegisterOnly] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nameAvailable, setNameAvailable] = useState<boolean | null>(null);
  const [isCheckingName, setIsCheckingName] = useState(false);
  const [showAuthValue, setShowAuthValue] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const checkTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const getFinalAuthHeader = () => {
    if (!authToken.trim()) return null;
    return composeFinalHeader(headerType, customHeader);
  };

  const getFinalAuthValue = () => {
    if (!authToken.trim()) return null;
    return composeFinalValue(valueFormat, customPrefix, authToken);
  };

  const isDirty = useCallback(() => {
    return (
      name.trim() !== "" ||
      walletId !== null ||
      backendUrl.trim() !== "" ||
      authToken.trim() !== "" ||
      customHeader.trim() !== "" ||
      customPrefix.trim() !== "" ||
      defaultPrice !== "0.01" ||
      defaultScheme !== "exact" ||
      registerOnly !== false
    );
  }, [
    name,
    walletId,
    backendUrl,
    authToken,
    customHeader,
    customPrefix,
    defaultPrice,
    defaultScheme,
    registerOnly,
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
    setHeaderType("Authorization");
    setCustomHeader("");
    setValueFormat("bearer");
    setCustomPrefix("");
    setAuthToken("");
    setDefaultPrice("0.01");
    setDefaultScheme("exact");
    setRegisterOnly(false);
    setError("");
    setNameAvailable(null);
    setIsCheckingName(false);
    setIsCelebrating(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (isSubmitting || isCelebrating) return;
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
    const finalHeader = getFinalAuthHeader();
    const finalValue = getFinalAuthValue();
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
    if (headerType === "custom" && customHeader.trim()) {
      if (isBlockedHeader(customHeader.trim())) {
        setError(`Header "${customHeader}" is not allowed`);
        return;
      }
      if (customHeader.trim().toLowerCase().startsWith("proxy-")) {
        setError("Proxy-* headers are not allowed");
        return;
      }
    }
    if (finalHeader && finalHeader.length > 256) {
      setError("Auth header is too long (max 256 characters)");
      return;
    }
    if (finalValue && finalValue.length > 4096) {
      setError("Auth value is too long (max 4096 characters)");
      return;
    }
    if (!walletId && !registerOnly) {
      setError("Wallet is required");
      return;
    }
    if (price < 0) {
      setError("Price cannot be negative");
      return;
    }
    if (price > 0 && price < MIN_PRICE_USD) {
      setError(`Minimum price is $${MIN_PRICE_USD} (use $0 for free)`);
      return;
    }
    if (price > MAX_PRICE_USD) {
      setError(`Price must be $${MAX_PRICE_USD} or less`);
      return;
    }

    setIsSubmitting(true);
    const submitStartTime = Date.now();

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
        upstream_auth_header: finalHeader,
        upstream_auth_value: finalValue,
        default_price_usdc: Math.round(
          (parseFloat(defaultPrice) || 0) * 1_000_000,
        ),
        default_scheme: defaultScheme,
        register_only: registerOnly,
      });
      toast({
        title: "Proxy created",
        description: `${name.trim()} has been created successfully.`,
        variant: "success",
      });
      refreshOnboardingStatus(organizationId);

      if (isFirstProxy) {
        const elapsed = Date.now() - submitStartTime;
        const remainingDelay = Math.max(0, 2000 - elapsed);
        setTimeout(() => {
          setIsSubmitting(false);
          setIsCelebrating(true);
        }, remainingDelay);
      } else {
        setIsSubmitting(false);
        resetForm();
        onOpenChange(false);
        onSuccess();
      }
    } catch (err) {
      if (err instanceof ApiError && err.data) {
        const data = err.data as { error?: string };
        setError(data.error || "Failed to create proxy");
      } else {
        setError(err instanceof Error ? err.message : "Failed to create proxy");
      }
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-gray-6 bg-gray-1 p-6 shadow-xl"
          onInteractOutside={(e) => {
            if (isSubmitting || isCelebrating || isDirty()) {
              e.preventDefault();
              if (!isSubmitting && !isCelebrating && isDirty()) {
                setShowDiscardConfirm(true);
              }
            }
          }}
          onEscapeKeyDown={(e) => {
            if (isSubmitting || isCelebrating || isDirty()) {
              e.preventDefault();
              if (!isSubmitting && !isCelebrating && isDirty()) {
                setShowDiscardConfirm(true);
              }
            }
          }}
        >
          {isCelebrating ? (
            <div className="flex flex-col items-center justify-center py-8 text-center rounded-lg border border-corbits-orange bg-corbits-orange/5 -m-6 p-6">
              <div className="mb-4 text-5xl">🎉</div>
              <h2 className="text-xl font-semibold text-gray-12">
                You&apos;re all set!
              </h2>
              <p className="mt-2 text-sm text-gray-11 max-w-xs">
                Your API is ready to accept payments. Check out the docs to
                learn more about integrating with your clients.
              </p>
              <div className="mt-6 flex justify-center gap-3">
                <a
                  href="https://docs.corbits.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border border-gray-6 px-4 py-2 text-sm text-gray-11 transition-colors hover:bg-gray-3 hover:text-gray-12"
                >
                  View Docs
                </a>
                <button
                  onClick={async () => {
                    await api.post(
                      `/api/organizations/${organizationId}/complete-onboarding`,
                      {},
                    );
                    refreshOnboardingStatus(organizationId);
                    router.push("/dashboard");
                    setTimeout(() => {
                      resetForm();
                      setIsCelebrating(false);
                      onOpenChange(false);
                      onSuccess();
                    }, 1000);
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-corbits-orange px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-corbits-orange/90"
                >
                  Finish
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
                </button>
              </div>
            </div>
          ) : (
            <>
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
                        {sanitizeProxyName(name) || "<name>"}.{organizationSlug}
                        .api.corbits.dev
                      </span>
                    ) : (
                      <>
                        <span className="text-gray-9">&lt;name&gt;</span>
                        <span className="text-gray-12">
                          .{organizationSlug}.api.corbits.dev
                        </span>
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
                        PayTo Wallet{" "}
                        {!registerOnly && (
                          <span className="text-red-400">*</span>
                        )}
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
                                    <Select.ItemText>
                                      {wallet.name}
                                    </Select.ItemText>
                                    {isUnfunded && (
                                      <span className="rounded-full border border-yellow-800 bg-yellow-900/30 px-2 py-0.5 text-xs text-yellow-400">
                                        unfunded
                                      </span>
                                    )}
                                  </Select.Item>
                                );
                              })}
                              <div className="mt-1 border-t border-gray-6 pt-1">
                                <Link
                                  href="/wallets"
                                  onClick={() => onOpenChange(false)}
                                  className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-accent-11 hover:bg-gray-4"
                                >
                                  <PlusIcon className="h-4 w-4" />
                                  Create new wallet
                                </Link>
                              </div>
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
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1.5 block text-sm text-gray-11">
                            Auth Header
                          </label>
                          <Select.Root
                            value={headerType}
                            onValueChange={(value) =>
                              setHeaderType(value as typeof headerType)
                            }
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
                                  {[
                                    "Authorization",
                                    "X-API-Key",
                                    "X-Auth-Token",
                                    "Api-Key",
                                    "custom",
                                  ].map((opt) => (
                                    <Select.Item
                                      key={opt}
                                      value={opt}
                                      className="relative flex cursor-pointer select-none items-center rounded px-8 py-2 text-sm outline-none hover:bg-gray-4 data-[highlighted]:bg-gray-4"
                                    >
                                      <Select.ItemIndicator className="absolute left-2 inline-flex items-center">
                                        <CheckIcon className="h-4 w-4 text-accent-11" />
                                      </Select.ItemIndicator>
                                      <Select.ItemText>
                                        {opt === "custom" ? "Custom" : opt}
                                      </Select.ItemText>
                                    </Select.Item>
                                  ))}
                                </Select.Viewport>
                              </Select.Content>
                            </Select.Portal>
                          </Select.Root>
                        </div>
                        <div>
                          <label className="mb-1.5 block text-sm text-gray-11">
                            Value Format
                          </label>
                          <Select.Root
                            value={valueFormat}
                            onValueChange={(value) =>
                              setValueFormat(value as typeof valueFormat)
                            }
                          >
                            <Select.Trigger className="flex w-full items-center justify-between rounded-md border border-gray-6 bg-gray-2 px-3 py-2 text-sm text-gray-12 focus:border-accent-8 focus:outline-none focus:ring-1 focus:ring-accent-8">
                              <Select.Value>
                                {valueFormat === "bearer"
                                  ? "Bearer"
                                  : valueFormat === "basic"
                                    ? "Basic"
                                    : valueFormat === "none"
                                      ? "None (raw)"
                                      : "Custom"}
                              </Select.Value>
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
                                  {[
                                    { value: "bearer", label: "Bearer" },
                                    { value: "basic", label: "Basic" },
                                    { value: "none", label: "None (raw)" },
                                    { value: "custom", label: "Custom" },
                                  ].map((opt) => (
                                    <Select.Item
                                      key={opt.value}
                                      value={opt.value}
                                      className="relative flex cursor-pointer select-none items-center rounded px-8 py-2 text-sm outline-none hover:bg-gray-4 data-[highlighted]:bg-gray-4"
                                    >
                                      <Select.ItemIndicator className="absolute left-2 inline-flex items-center">
                                        <CheckIcon className="h-4 w-4 text-accent-11" />
                                      </Select.ItemIndicator>
                                      <Select.ItemText>
                                        {opt.label}
                                      </Select.ItemText>
                                    </Select.Item>
                                  ))}
                                </Select.Viewport>
                              </Select.Content>
                            </Select.Portal>
                          </Select.Root>
                        </div>
                      </div>
                      {headerType === "custom" && (
                        <div>
                          <label className="mb-1.5 block text-sm text-gray-11">
                            Custom Header Name
                          </label>
                          <input
                            type="text"
                            value={customHeader}
                            onChange={(e) => setCustomHeader(e.target.value)}
                            placeholder="X-Custom-Auth"
                            className="w-full rounded-md border border-gray-6 bg-gray-2 px-3 py-2 text-sm text-gray-12 placeholder-gray-9 focus:border-accent-8 focus:outline-none focus:ring-1 focus:ring-accent-8"
                          />
                        </div>
                      )}
                      {valueFormat === "custom" && (
                        <div>
                          <label className="mb-1.5 block text-sm text-gray-11">
                            Custom Prefix
                          </label>
                          <input
                            type="text"
                            value={customPrefix}
                            onChange={(e) => setCustomPrefix(e.target.value)}
                            placeholder="Token"
                            className="w-full rounded-md border border-gray-6 bg-gray-2 px-3 py-2 text-sm text-gray-12 placeholder-gray-9 focus:border-accent-8 focus:outline-none focus:ring-1 focus:ring-accent-8"
                          />
                        </div>
                      )}
                      <div>
                        <label className="mb-1.5 block text-sm text-gray-11">
                          Token / API Key
                        </label>
                        <div className="relative">
                          <input
                            type={showAuthValue ? "text" : "password"}
                            value={authToken}
                            onChange={(e) => setAuthToken(e.target.value)}
                            placeholder="Your secret token or API key"
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
                        {getFinalAuthHeader() && (
                          <p className="mt-1.5 text-xs text-gray-9">
                            Final header:{" "}
                            <code className="text-gray-11">
                              {getFinalAuthHeader()}:{" "}
                              {composeFinalValue(
                                valueFormat,
                                customPrefix,
                                maskToken(authToken),
                              )}
                            </code>
                          </p>
                        )}
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
                          <span className="pr-2 text-xs text-gray-11">
                            USDC
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const val = parseFloat(defaultPrice || "0") + 0.01;
                            setDefaultPrice(
                              val.toFixed(6).replace(/\.?0+$/, ""),
                            );
                          }}
                          className="flex h-9 w-9 items-center justify-center text-gray-11 hover:bg-gray-3 hover:text-gray-12 transition-colors rounded-r-md"
                        >
                          <PlusIcon className="h-4 w-4" />
                        </button>
                      </div>
                      {(() => {
                        const price = parseFloat(defaultPrice);
                        if (defaultPrice === "" || isNaN(price)) {
                          return null;
                        }
                        if (price < 0) {
                          return (
                            <p className="mt-1.5 text-xs text-red-400">
                              Price cannot be negative
                            </p>
                          );
                        }
                        if (price > MAX_PRICE_USD) {
                          return (
                            <p className="mt-1.5 text-xs text-red-400">
                              Max price is ${MAX_PRICE_USD}
                            </p>
                          );
                        }
                        if (price > 0 && price < MIN_PRICE_USD) {
                          return (
                            <p className="mt-1.5 text-xs text-red-400">
                              Min price is ${MIN_PRICE_USD} (use $0 for free)
                            </p>
                          );
                        }
                        if (price === 0) {
                          return (
                            <p className="mt-1.5 text-xs text-green-400">
                              Free
                            </p>
                          );
                        }
                        return (
                          <p className="mt-1.5 text-xs text-green-400">
                            ${price.toFixed(6).replace(/\.?0+$/, "")} per
                            request
                          </p>
                        );
                      })()}
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
                                  disabled={opt.disabled}
                                  className="relative flex cursor-pointer select-none items-center justify-between rounded px-8 py-2 text-sm outline-none hover:bg-gray-4 data-[highlighted]:bg-gray-4 data-[disabled]:cursor-not-allowed data-[disabled]:text-gray-8 data-[disabled]:hover:bg-transparent"
                                >
                                  <Select.ItemIndicator className="absolute left-2 inline-flex items-center">
                                    <CheckIcon className="h-4 w-4 text-accent-11" />
                                  </Select.ItemIndicator>
                                  <Select.ItemText>{opt.label}</Select.ItemText>
                                  {opt.disabled && (
                                    <span className="ml-2 text-[10px] text-corbits-orange">
                                      Coming Soon!
                                    </span>
                                  )}
                                </Select.Item>
                              ))}
                            </Select.Viewport>
                          </Select.Content>
                        </Select.Portal>
                      </Select.Root>
                    </div>
                  </div>
                </section>

                {/* Register Only Option */}
                <section>
                  <div className="space-y-3">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <Checkbox.Root
                        checked={registerOnly}
                        onCheckedChange={(checked) =>
                          setRegisterOnly(checked === true)
                        }
                        className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                          registerOnly
                            ? "border-blue-600 bg-blue-600"
                            : "border-gray-6 bg-gray-3 hover:border-gray-8"
                        }`}
                      >
                        <Checkbox.Indicator>
                          <CheckIcon className="h-3.5 w-3.5 text-white" />
                        </Checkbox.Indicator>
                      </Checkbox.Root>
                      <div className="flex-1">
                        <span className="text-sm text-gray-12">
                          Register only (don&apos;t go live yet)
                        </span>
                        <p className="mt-0.5 text-xs text-gray-11">
                          Create the proxy for tracking purposes. You can
                          activate it later from the proxy settings.
                        </p>
                      </div>
                    </label>

                    {registerOnly && (
                      <div className="rounded-md border border-blue-800 bg-blue-900/20 px-3 py-2 text-sm text-blue-300">
                        <p className="flex items-start gap-2">
                          <InfoCircledIcon className="h-4 w-4 mt-0.5 flex-shrink-0" />
                          <span>
                            The proxy will be created in a{" "}
                            <strong>registered</strong> state. It won&apos;t
                            accept requests until you activate it.
                          </span>
                        </p>
                      </div>
                    )}
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
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-corbits-orange px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-corbits-orange/90 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isSubmitting ? "Creating..." : "Create Proxy"}
                    {isSubmitting ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
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
                </div>
              </form>
            </>
          )}

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
