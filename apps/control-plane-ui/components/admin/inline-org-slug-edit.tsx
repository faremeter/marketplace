"use client";

import { useState, useEffect, useRef } from "react";
import * as Popover from "@radix-ui/react-popover";
import {
  Pencil1Icon,
  CheckIcon,
  Cross2Icon,
  CheckCircledIcon,
  CrossCircledIcon,
} from "@radix-ui/react-icons";
import { api, ApiError } from "@/lib/api/client";
import { useToast } from "@/components/ui/toast";
import { getProxyUrlPattern } from "@/lib/format";

const MIN_SLUG_LENGTH = 4;
const MAX_SLUG_LENGTH = 58;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

function validateOrgSlug(slug: string): { valid: boolean; error?: string } {
  if (slug.length < MIN_SLUG_LENGTH) {
    return {
      valid: false,
      error: `Must be at least ${MIN_SLUG_LENGTH} characters`,
    };
  }
  if (slug.length > MAX_SLUG_LENGTH) {
    return {
      valid: false,
      error: `Must be at most ${MAX_SLUG_LENGTH} characters`,
    };
  }
  if (!SLUG_PATTERN.test(slug)) {
    return {
      valid: false,
      error: "Lowercase letters, numbers, and hyphens only",
    };
  }
  return { valid: true };
}

interface InlineOrgSlugEditProps {
  tenantId: number;
  tenantName: string;
  orgSlug: string | null | undefined;
  onUpdate: () => void;
  disabled?: boolean;
  disabledReason?: string | null;
}

export function InlineOrgSlugEdit({
  tenantId,
  tenantName,
  orgSlug,
  onUpdate,
  disabled,
  disabledReason,
}: InlineOrgSlugEditProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [value, setValue] = useState(orgSlug ?? "");
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const checkTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastCheckedRef = useRef<string>("");

  const trimmed = value.trim();
  const newOrgSlug = trimmed || null;
  const hasChanged = newOrgSlug !== (orgSlug ?? null);
  const formatValidation = trimmed ? validateOrgSlug(trimmed) : { valid: true };

  useEffect(() => {
    if (!isOpen || !hasChanged) {
      setIsAvailable(null);
      setIsChecking(false);
      return;
    }

    // If format is invalid, don't check availability
    if (trimmed && !formatValidation.valid) {
      setIsAvailable(null);
      setIsChecking(false);
      return;
    }

    setIsChecking(true);
    setIsAvailable(null);

    if (checkTimeoutRef.current) {
      clearTimeout(checkTimeoutRef.current);
    }

    const cacheKey = `${tenantName}:${trimmed}`;

    checkTimeoutRef.current = setTimeout(() => {
      void (async () => {
        lastCheckedRef.current = cacheKey;

        try {
          const orgSlugParam = trimmed ? encodeURIComponent(trimmed) : "null";
          const url = `/api/admin/tenants/check-name?name=${encodeURIComponent(tenantName)}&org_slug=${orgSlugParam}&excludeId=${tenantId}`;
          const result = await api.get<{ available: boolean }>(url);

          if (lastCheckedRef.current === cacheKey) {
            setIsAvailable(result.available);
          }
        } catch {
          if (lastCheckedRef.current === cacheKey) {
            setIsAvailable(null);
          }
        } finally {
          if (lastCheckedRef.current === cacheKey) {
            setIsChecking(false);
          }
        }
      })();
    }, 500);

    return () => {
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
      }
    };
  }, [
    isOpen,
    hasChanged,
    trimmed,
    tenantName,
    tenantId,
    formatValidation.valid,
  ]);

  const handleSave = async () => {
    if (!hasChanged) {
      setIsOpen(false);
      return;
    }

    // Block if format invalid
    if (trimmed && !formatValidation.valid) {
      return;
    }

    // Block if availability check not passed
    if (isAvailable === false || isChecking) {
      return;
    }

    setIsSaving(true);
    try {
      await api.put(`/api/admin/tenants/${tenantId}`, { org_slug: newOrgSlug });
      toast({
        title: "Org slug updated",
        description: `Domain will be reprovisioned.`,
        variant: "success",
      });
      onUpdate();
      setIsOpen(false);
    } catch (err) {
      let message = "Unknown error";
      if (err instanceof ApiError && err.data) {
        const data = err.data as { error?: string };
        message = data.error ?? err.message;
      } else if (err instanceof Error) {
        message = err.message;
      }
      toast({
        title: "Failed to update",
        description: message,
        variant: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpen = (open: boolean) => {
    if (open) {
      setValue(orgSlug ?? "");
      setIsAvailable(null);
      setIsChecking(false);
    }
    setIsOpen(open);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      void handleSave();
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  const canSave =
    hasChanged &&
    !isSaving &&
    (trimmed === "" || formatValidation.valid) &&
    isAvailable === true &&
    !isChecking;

  return (
    <Popover.Root open={isOpen} onOpenChange={handleOpen}>
      <Popover.Trigger asChild>
        <button
          className={`group flex items-center gap-1.5 rounded px-2 py-1 text-sm text-gray-11 hover:bg-gray-4 text-left ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          disabled={disabled}
          title={disabledReason ?? undefined}
        >
          {orgSlug ?? <span className="text-gray-9">-</span>}
          {!disabled && (
            <Pencil1Icon className="h-3 w-3 text-gray-11 opacity-0 group-hover:opacity-100" />
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="w-64 rounded-lg border border-gray-6 bg-gray-2 p-3 shadow-lg"
          sideOffset={5}
          align="start"
        >
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-11 mb-1">
                Org Slug
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoFocus
                  placeholder="Leave empty for legacy mode"
                  className="w-full rounded border border-gray-6 bg-gray-3 px-2 py-1.5 pr-7 text-sm text-gray-12 placeholder:text-gray-8 focus:border-accent-8 focus:outline-none"
                />
                {hasChanged && (trimmed === "" || formatValidation.valid) && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    {isChecking ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-6 border-t-gray-11" />
                    ) : isAvailable === true ? (
                      <CheckCircledIcon className="h-4 w-4 text-green-500" />
                    ) : isAvailable === false ? (
                      <CrossCircledIcon className="h-4 w-4 text-red-500" />
                    ) : null}
                  </div>
                )}
              </div>
              {trimmed && !formatValidation.valid && (
                <p className="mt-1 text-xs text-red-400">
                  {formatValidation.error}
                </p>
              )}
              {isAvailable === false && !isChecking && (
                <p className="mt-1 text-xs text-red-400">
                  Name already taken in this namespace
                </p>
              )}
              <p className="mt-1.5 text-xs text-gray-11">
                URL:{" "}
                <code className="text-gray-9">
                  {getProxyUrlPattern({
                    proxyName: tenantName,
                    orgSlug: newOrgSlug,
                  })}
                </code>
              </p>
              {hasChanged &&
                isAvailable !== false &&
                formatValidation.valid && (
                  <p className="mt-1 text-xs text-amber-400">
                    Changing will trigger certificate reprovisioning
                  </p>
                )}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsOpen(false)}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-11 hover:bg-gray-4"
              >
                <Cross2Icon className="h-3 w-3" />
                Cancel
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={!canSave}
                className="inline-flex items-center gap-1 rounded bg-accent-9 px-2 py-1 text-xs text-white hover:bg-accent-10 disabled:opacity-50"
              >
                <CheckIcon className="h-3 w-3" />
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
          <Popover.Arrow className="fill-gray-6" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
