"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Pencil1Icon, CheckIcon, Cross2Icon } from "@radix-ui/react-icons";
import { api } from "@/lib/api/client";
import { useToast } from "@/components/ui/toast";

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
  const [header, setHeader] = useState(authHeader ?? "");
  const [value, setValue] = useState(authValue ?? "");

  const hasAuth = authHeader && authValue;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.put(endpoint, {
        upstream_auth_header: header || null,
        upstream_auth_value: value || null,
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

  const handleOpen = (open: boolean) => {
    if (open) {
      setHeader(authHeader ?? "");
      setValue(authValue ?? "");
    }
    setIsOpen(open);
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
          {hasAuth ? authHeader : "Add auth"}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="w-72 rounded-lg border border-gray-6 bg-gray-2 p-3 shadow-lg"
          sideOffset={5}
          align="start"
        >
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-11 mb-1">
                Header Name
              </label>
              <input
                type="text"
                value={header}
                onChange={(e) => setHeader(e.target.value)}
                placeholder="Authorization"
                className="w-full rounded border border-gray-6 bg-gray-3 px-2 py-1.5 text-sm text-gray-12 placeholder:text-gray-8 focus:border-accent-8 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-11 mb-1">
                Header Value
              </label>
              <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Bearer xxx"
                className="w-full rounded border border-gray-6 bg-gray-3 px-2 py-1.5 text-sm text-gray-12 placeholder:text-gray-8 focus:border-accent-8 focus:outline-none"
              />
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
                onClick={handleSave}
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
