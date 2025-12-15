"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Pencil1Icon, CheckIcon, Cross2Icon } from "@radix-ui/react-icons";
import { api } from "@/lib/api/client";
import { useToast } from "@/components/ui/toast";

interface InlineUrlEditProps {
  tenantId: number;
  tenantName: string;
  backendUrl: string;
  onUpdate: () => void;
  apiEndpoint?: string;
}

export function InlineUrlEdit({
  tenantId,
  tenantName,
  backendUrl,
  onUpdate,
  apiEndpoint,
}: InlineUrlEditProps) {
  const endpoint = apiEndpoint ?? `/api/admin/tenants/${tenantId}`;
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [url, setUrl] = useState(backendUrl);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.put(endpoint, {
        backend_url: url,
      });
      toast({
        title: "Backend URL updated",
        description: `${tenantName} backend URL has been updated.`,
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
      setUrl(backendUrl);
    }
    setIsOpen(open);
  };

  const truncatedUrl =
    backendUrl.length > 50 ? `${backendUrl.slice(0, 50)}...` : backendUrl;

  return (
    <Popover.Root open={isOpen} onOpenChange={handleOpen}>
      <Tooltip.Provider delayDuration={200}>
        <Tooltip.Root>
          <Popover.Trigger asChild>
            <Tooltip.Trigger asChild>
              <button className="group flex items-center gap-1 rounded bg-gray-4 px-2 py-1 text-xs text-gray-11 hover:bg-gray-5 cursor-pointer text-left">
                <code>{truncatedUrl}</code>
                <Pencil1Icon className="h-3 w-3 opacity-0 group-hover:opacity-50" />
              </button>
            </Tooltip.Trigger>
          </Popover.Trigger>
          {!isOpen && (
            <Tooltip.Portal>
              <Tooltip.Content
                className="rounded bg-gray-12 px-2 py-1 text-xs text-gray-1"
                sideOffset={5}
              >
                {backendUrl}
                <Tooltip.Arrow className="fill-gray-12" />
              </Tooltip.Content>
            </Tooltip.Portal>
          )}
        </Tooltip.Root>
      </Tooltip.Provider>
      <Popover.Portal>
        <Popover.Content
          className="w-96 rounded-lg border border-gray-6 bg-gray-2 p-3 shadow-lg"
          sideOffset={5}
          align="start"
        >
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-11 mb-1">
                Backend URL
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://api.example.com"
                className="w-full rounded border border-gray-6 bg-gray-3 px-2 py-1.5 text-sm text-gray-12 placeholder:text-gray-8 focus:border-accent-8 focus:outline-none font-mono"
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
