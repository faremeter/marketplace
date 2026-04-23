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
import { sanitizeProxyName } from "@/lib/proxy-name";

interface InlineNameEditProps {
  name: string;
  onUpdate: () => void;
  apiEndpoint: string;
  fieldName?: string;
  label?: string;
  checkAvailabilityEndpoint?: string;
  excludeId?: number;
  organizationId?: number | null;
  disabled?: boolean;
  disabledReason?: string | null;
}

export function InlineNameEdit({
  name,
  onUpdate,
  apiEndpoint,
  fieldName = "name",
  label = "Name",
  checkAvailabilityEndpoint,
  excludeId,
  organizationId,
  disabled,
  disabledReason,
}: InlineNameEditProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [value, setValue] = useState(name);
  const [nameAvailable, setNameAvailable] = useState<boolean | null>(null);
  const [isCheckingName, setIsCheckingName] = useState(false);
  const checkTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastCheckedRef = useRef<string>("");

  useEffect(() => {
    if (!checkAvailabilityEndpoint || !isOpen) {
      return;
    }

    const sanitized = sanitizeProxyName(value.trim());

    if (!sanitized || sanitized === name) {
      setNameAvailable(null);
      setIsCheckingName(false);
      return;
    }

    setIsCheckingName(true);
    setNameAvailable(null);

    if (checkTimeoutRef.current) {
      clearTimeout(checkTimeoutRef.current);
    }

    checkTimeoutRef.current = setTimeout(() => {
      void (async () => {
        lastCheckedRef.current = sanitized;

        try {
          let url = `${checkAvailabilityEndpoint}?name=${encodeURIComponent(sanitized)}`;
          if (excludeId !== undefined) {
            url += `&excludeId=${excludeId}`;
          }
          if (organizationId) {
            url += `&organization_id=${organizationId}`;
          }

          const result = await api.get<{ available: boolean }>(url);

          if (lastCheckedRef.current === sanitized) {
            setNameAvailable(result.available);
          }
        } catch {
          if (lastCheckedRef.current === sanitized) {
            setNameAvailable(null);
          }
        } finally {
          if (lastCheckedRef.current === sanitized) {
            setIsCheckingName(false);
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
    value,
    name,
    checkAvailabilityEndpoint,
    excludeId,
    organizationId,
    isOpen,
  ]);

  const handleSave = async () => {
    const sanitized = sanitizeProxyName(value.trim());

    if (!sanitized || sanitized === name) {
      setIsOpen(false);
      return;
    }

    if (
      checkAvailabilityEndpoint &&
      (nameAvailable === false || isCheckingName)
    ) {
      return;
    }

    setIsSaving(true);
    try {
      await api.put(apiEndpoint, { [fieldName]: value.trim() });
      toast({
        title: `${label} updated`,
        description: `${label} has been updated.`,
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
      setValue(name);
      setNameAvailable(null);
      setIsCheckingName(false);
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

  const sanitizedValue = sanitizeProxyName(value.trim());
  const isNameChanged = sanitizedValue && sanitizedValue !== name;

  const canSave =
    isNameChanged &&
    !isSaving &&
    (!checkAvailabilityEndpoint || (nameAvailable === true && !isCheckingName));

  return (
    <Popover.Root open={isOpen} onOpenChange={handleOpen}>
      <Popover.Trigger asChild>
        <button
          className={`group flex items-center gap-1.5 rounded px-2 py-1 text-sm font-medium text-gray-12 hover:bg-gray-4 text-left ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          disabled={disabled}
          title={disabledReason ?? undefined}
        >
          {name}
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
                {label}
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoFocus
                  className="w-full rounded border border-gray-6 bg-gray-3 px-2 py-1.5 pr-7 text-sm text-gray-12 placeholder:text-gray-8 focus:border-accent-8 focus:outline-none"
                />
                {checkAvailabilityEndpoint && isNameChanged && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    {isCheckingName ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-6 border-t-gray-11" />
                    ) : nameAvailable === true ? (
                      <CheckCircledIcon className="h-4 w-4 text-green-500" />
                    ) : nameAvailable === false ? (
                      <CrossCircledIcon className="h-4 w-4 text-red-500" />
                    ) : null}
                  </div>
                )}
              </div>
              {checkAvailabilityEndpoint &&
                nameAvailable === false &&
                !isCheckingName && (
                  <p className="mt-1 text-xs text-red-400">
                    This name is already taken
                  </p>
                )}
              {isNameChanged && nameAvailable !== false && (
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
