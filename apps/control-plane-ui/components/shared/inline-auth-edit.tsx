"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import * as Select from "@radix-ui/react-select";
import {
  Pencil1Icon,
  CheckIcon,
  Cross2Icon,
  ChevronDownIcon,
  EyeOpenIcon,
  EyeClosedIcon,
} from "@radix-ui/react-icons";
import { api } from "@/lib/api/client";
import { useToast } from "@/components/ui/toast";
import {
  type HeaderType,
  type ValueFormat,
  isBlockedHeader,
  parseExistingAuth,
  composeFinalHeader,
  composeFinalValue,
} from "@/lib/auth-header";

interface InlineAuthEditProps {
  tenantId: number;
  tenantName: string;
  authHeader: string | null;
  authValue: string | null;
  onUpdate: () => void;
  apiEndpoint?: string;
}

export function InlineAuthEdit({
  tenantId,
  tenantName,
  authHeader,
  authValue,
  onUpdate,
  apiEndpoint,
}: InlineAuthEditProps) {
  const endpoint = apiEndpoint ?? `/api/admin/tenants/${tenantId}`;
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const [headerType, setHeaderType] = useState<HeaderType>("Authorization");
  const [customHeader, setCustomHeader] = useState("");
  const [valueFormat, setValueFormat] = useState<ValueFormat>("bearer");
  const [customPrefix, setCustomPrefix] = useState("");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);

  const hasAuth = authHeader && authValue;

  const handleOpen = (open: boolean) => {
    if (open) {
      const parsed = parseExistingAuth(authHeader, authValue);
      setHeaderType(parsed.headerType);
      setCustomHeader(parsed.customHeader);
      setValueFormat(parsed.valueFormat);
      setCustomPrefix(parsed.customPrefix);
      setToken(parsed.token);
      setError("");
    }
    setIsOpen(open);
  };

  const handleSave = async () => {
    setError("");

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

    const finalHeader = token.trim()
      ? composeFinalHeader(headerType, customHeader)
      : null;
    const finalValue = token.trim()
      ? composeFinalValue(valueFormat, customPrefix, token)
      : null;

    setIsSaving(true);
    try {
      await api.put(endpoint, {
        upstream_auth_header: finalHeader,
        upstream_auth_value: finalValue,
      });
      toast({
        title: "Auth updated",
        description: `${tenantName} auth has been updated.`,
        variant: "success",
      });
      onUpdate();
      setIsOpen(false);
    } catch (err) {
      toast({
        title: "Failed to update",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Popover.Root open={isOpen} onOpenChange={handleOpen}>
      <Popover.Trigger asChild>
        <button
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
            hasAuth
              ? "border-purple-800 bg-purple-900/50 text-purple-400 hover:bg-purple-900/70"
              : "border-gray-700 bg-gray-800/50 text-gray-400 hover:bg-gray-700/50"
          }`}
        >
          <Pencil1Icon className="h-3 w-3" />
          {hasAuth ? "Edit" : "Add"}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="w-80 rounded-lg border border-gray-6 bg-gray-2 p-3 shadow-lg"
          sideOffset={5}
          align="start"
        >
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-11 mb-1">
                  Header
                </label>
                <Select.Root
                  value={headerType}
                  onValueChange={(v) => setHeaderType(v as HeaderType)}
                >
                  <Select.Trigger className="flex w-full items-center justify-between rounded border border-gray-6 bg-gray-3 px-2 py-1.5 text-xs text-gray-12 focus:border-accent-8 focus:outline-none">
                    <Select.Value />
                    <Select.Icon>
                      <ChevronDownIcon className="h-3 w-3 text-gray-11" />
                    </Select.Icon>
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content
                      className="overflow-hidden rounded border border-gray-6 bg-gray-2 shadow-lg"
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
                            className="relative flex cursor-pointer select-none items-center rounded px-6 py-1.5 text-xs outline-none hover:bg-gray-4 data-[highlighted]:bg-gray-4"
                          >
                            <Select.ItemIndicator className="absolute left-1 inline-flex items-center">
                              <CheckIcon className="h-3 w-3 text-accent-11" />
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
                <label className="block text-xs font-medium text-gray-11 mb-1">
                  Format
                </label>
                <Select.Root
                  value={valueFormat}
                  onValueChange={(v) => setValueFormat(v as ValueFormat)}
                >
                  <Select.Trigger className="flex w-full items-center justify-between rounded border border-gray-6 bg-gray-3 px-2 py-1.5 text-xs text-gray-12 focus:border-accent-8 focus:outline-none">
                    <Select.Value>
                      {valueFormat === "bearer"
                        ? "Bearer"
                        : valueFormat === "basic"
                          ? "Basic"
                          : valueFormat === "none"
                            ? "None"
                            : "Custom"}
                    </Select.Value>
                    <Select.Icon>
                      <ChevronDownIcon className="h-3 w-3 text-gray-11" />
                    </Select.Icon>
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content
                      className="overflow-hidden rounded border border-gray-6 bg-gray-2 shadow-lg"
                      position="popper"
                      sideOffset={4}
                    >
                      <Select.Viewport className="p-1">
                        {[
                          { value: "bearer", label: "Bearer" },
                          { value: "basic", label: "Basic" },
                          { value: "none", label: "None" },
                          { value: "custom", label: "Custom" },
                        ].map((opt) => (
                          <Select.Item
                            key={opt.value}
                            value={opt.value}
                            className="relative flex cursor-pointer select-none items-center rounded px-6 py-1.5 text-xs outline-none hover:bg-gray-4 data-[highlighted]:bg-gray-4"
                          >
                            <Select.ItemIndicator className="absolute left-1 inline-flex items-center">
                              <CheckIcon className="h-3 w-3 text-accent-11" />
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
            {headerType === "custom" && (
              <div>
                <label className="block text-xs font-medium text-gray-11 mb-1">
                  Custom Header
                </label>
                <input
                  type="text"
                  value={customHeader}
                  onChange={(e) => setCustomHeader(e.target.value)}
                  placeholder="X-Custom-Auth"
                  className="w-full rounded border border-gray-6 bg-gray-3 px-2 py-1.5 text-xs text-gray-12 placeholder:text-gray-8 focus:border-accent-8 focus:outline-none"
                />
              </div>
            )}
            {valueFormat === "custom" && (
              <div>
                <label className="block text-xs font-medium text-gray-11 mb-1">
                  Custom Prefix
                </label>
                <input
                  type="text"
                  value={customPrefix}
                  onChange={(e) => setCustomPrefix(e.target.value)}
                  placeholder="Token"
                  className="w-full rounded border border-gray-6 bg-gray-3 px-2 py-1.5 text-xs text-gray-12 placeholder:text-gray-8 focus:border-accent-8 focus:outline-none"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-11 mb-1">
                Token / API Key
              </label>
              <div className="relative">
                <input
                  type={showToken ? "text" : "password"}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Your secret token"
                  className="w-full rounded border border-gray-6 bg-gray-3 px-2 py-1.5 pr-7 text-xs text-gray-12 placeholder:text-gray-8 focus:border-accent-8 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-11 hover:text-gray-12"
                >
                  {showToken ? (
                    <EyeOpenIcon className="h-3 w-3" />
                  ) : (
                    <EyeClosedIcon className="h-3 w-3" />
                  )}
                </button>
              </div>
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
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
                disabled={isSaving}
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
