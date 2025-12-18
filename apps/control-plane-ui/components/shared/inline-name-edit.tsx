"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Pencil1Icon, CheckIcon, Cross2Icon } from "@radix-ui/react-icons";
import { api } from "@/lib/api/client";
import { useToast } from "@/components/ui/toast";

interface InlineNameEditProps {
  name: string;
  onUpdate: () => void;
  apiEndpoint: string;
  fieldName?: string;
  label?: string;
}

export function InlineNameEdit({
  name,
  onUpdate,
  apiEndpoint,
  fieldName = "name",
  label = "Name",
}: InlineNameEditProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [value, setValue] = useState(name);

  const handleSave = async () => {
    if (!value.trim() || value === name) {
      setIsOpen(false);
      return;
    }

    setIsSaving(true);
    try {
      await api.put(apiEndpoint, {
        [fieldName]: value.trim(),
      });
      toast({
        title: `${label} updated`,
        description: `${label} has been updated.`,
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
      setValue(name);
    }
    setIsOpen(open);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <Popover.Root open={isOpen} onOpenChange={handleOpen}>
      <Popover.Trigger asChild>
        <button className="group flex items-center gap-1.5 rounded px-2 py-1 text-sm font-medium text-gray-12 hover:bg-gray-4 cursor-pointer text-left">
          {name}
          <Pencil1Icon className="h-3 w-3 text-gray-11 opacity-0 group-hover:opacity-100" />
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
              <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
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
                disabled={isSaving || !value.trim()}
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
