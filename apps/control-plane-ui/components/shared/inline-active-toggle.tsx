"use client";

import { useState } from "react";
import { api } from "@/lib/api/client";
import { useToast } from "@/components/ui/toast";
import { CheckCircledIcon, CrossCircledIcon } from "@radix-ui/react-icons";

interface InlineActiveToggleProps {
  tenantId: number;
  tenantName: string;
  isActive: boolean;
  onUpdate: () => void;
  apiEndpoint?: string;
}

export function InlineActiveToggle({
  tenantId,
  tenantName,
  isActive,
  onUpdate,
  apiEndpoint,
}: InlineActiveToggleProps) {
  const endpoint = apiEndpoint ?? `/api/admin/tenants/${tenantId}`;
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const handleToggle = async () => {
    setIsSaving(true);
    try {
      await api.put(endpoint, {
        is_active: !isActive,
      });
      toast({
        title: isActive ? "Tenant deactivated" : "Tenant activated",
        description: `${tenantName} is now ${isActive ? "inactive" : "active"}.`,
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
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={isSaving}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
        isSaving
          ? "opacity-50 cursor-not-allowed border-gray-6 bg-gray-3 text-gray-11"
          : isActive
            ? "border-green-800 bg-green-900/50 text-green-400 hover:bg-green-900/70 cursor-pointer"
            : "border-gray-700 bg-gray-800/50 text-gray-400 hover:bg-gray-700/50 cursor-pointer"
      }`}
    >
      {isActive ? (
        <CheckCircledIcon className="h-3 w-3" />
      ) : (
        <CrossCircledIcon className="h-3 w-3" />
      )}
      {isSaving ? "..." : isActive ? "Active" : "Inactive"}
    </button>
  );
}
