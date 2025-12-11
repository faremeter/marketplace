"use client";

import { useState } from "react";
import * as Select from "@radix-ui/react-select";
import { ChevronDownIcon, CheckIcon } from "@radix-ui/react-icons";
import useSWR from "swr";
import { api } from "@/lib/api/client";
import { useToast } from "@/components/ui/toast";

interface Organization {
  id: number;
  name: string;
  slug: string;
}

interface InlineOrgSelectProps {
  tenantId: number;
  tenantName: string;
  currentOrgId: number | null;
  currentOrgName: string | null;
  onUpdate: () => void;
}

export function InlineOrgSelect({
  tenantId,
  tenantName,
  currentOrgId,
  currentOrgName,
  onUpdate,
}: InlineOrgSelectProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const { data: organizations } = useSWR(
    isOpen ? "/api/admin/organizations" : null,
    api.get<Organization[]>,
  );

  const handleChange = async (value: string) => {
    const newOrgId = value === "none" ? null : parseInt(value);

    if (newOrgId === currentOrgId) {
      setIsOpen(false);
      return;
    }

    setIsSaving(true);
    try {
      await api.put(`/api/admin/tenants/${tenantId}`, {
        organization_id: newOrgId,
      });
      toast({
        title: "Organization updated",
        description: `${tenantName} has been updated.`,
        variant: "success",
      });
      onUpdate();
    } catch (err) {
      toast({
        title: "Failed to update",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "error",
      });
    } finally {
      setIsSaving(false);
      setIsOpen(false);
    }
  };

  return (
    <Select.Root
      value={currentOrgId?.toString() ?? "none"}
      onValueChange={handleChange}
      open={isOpen}
      onOpenChange={setIsOpen}
    >
      <Select.Trigger
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors focus:outline-none focus:ring-1 focus:ring-accent-8 ${
          isSaving
            ? "opacity-50 border-gray-6 bg-gray-3 text-gray-11"
            : currentOrgName
              ? "border-accent-7 bg-accent-3 text-accent-11 hover:bg-accent-4"
              : "border-gray-6 bg-gray-3 text-gray-10 hover:bg-gray-4 hover:text-gray-11"
        }`}
        disabled={isSaving}
      >
        <Select.Value>
          {isSaving ? "Saving..." : (currentOrgName ?? "Add org")}
        </Select.Value>
        <ChevronDownIcon className="h-3 w-3" />
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          className="overflow-hidden rounded-md border border-gray-6 bg-gray-2 shadow-lg"
          position="popper"
          sideOffset={4}
        >
          <Select.Viewport className="p-1">
            <Select.Item
              value="none"
              className="relative flex cursor-pointer select-none items-center rounded px-8 py-2 text-sm text-gray-11 outline-none hover:bg-gray-4 hover:text-gray-12 data-[highlighted]:bg-gray-4 data-[highlighted]:text-gray-12"
            >
              <Select.ItemText>No organization</Select.ItemText>
              <Select.ItemIndicator className="absolute left-2 inline-flex items-center">
                <CheckIcon className="h-4 w-4" />
              </Select.ItemIndicator>
            </Select.Item>

            {organizations?.map((org) => (
              <Select.Item
                key={org.id}
                value={org.id.toString()}
                className="relative flex cursor-pointer select-none items-center rounded px-8 py-2 text-sm text-gray-11 outline-none hover:bg-gray-4 hover:text-gray-12 data-[highlighted]:bg-gray-4 data-[highlighted]:text-gray-12"
              >
                <Select.ItemText>{org.name}</Select.ItemText>
                <Select.ItemIndicator className="absolute left-2 inline-flex items-center">
                  <CheckIcon className="h-4 w-4" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
