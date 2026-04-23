"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Pencil1Icon, CheckIcon, Cross2Icon } from "@radix-ui/react-icons";
import { api } from "@/lib/api/client";
import { useToast } from "@/components/ui/toast";

interface InlineOnboardingEditProps {
  orgId: number;
  orgName: string;
  isCompleted: boolean;
  onUpdate: () => void;
}

export function InlineOnboardingEdit({
  orgId,
  orgName,
  isCompleted,
  onUpdate,
}: InlineOnboardingEditProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selected, setSelected] = useState(isCompleted);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (selected) {
        await api.post(`/api/organizations/${orgId}/complete-onboarding`, {});
      } else {
        await api.post(`/api/organizations/${orgId}/reset-onboarding`, {});
      }
      toast({
        title: selected ? "Onboarding completed" : "Onboarding reset",
        description: `${orgName} onboarding status updated.`,
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
      setSelected(isCompleted);
    }
    setIsOpen(open);
  };

  return (
    <Popover.Root open={isOpen} onOpenChange={handleOpen}>
      <Popover.Trigger asChild>
        {isCompleted ? (
          <button className="group inline-flex items-center gap-1.5 rounded-full border border-green-800 bg-green-900/30 px-2 py-0.5 text-xs text-green-400 cursor-pointer hover:bg-green-900/50 transition-colors">
            <Pencil1Icon className="h-3 w-3 opacity-50 group-hover:opacity-100 transition-opacity" />
            Complete
          </button>
        ) : (
          <button className="group inline-flex items-center gap-1.5 rounded-full border border-yellow-800 bg-yellow-900/30 px-2 py-0.5 text-xs text-yellow-400 cursor-pointer hover:bg-yellow-900/50 transition-colors">
            <Pencil1Icon className="h-3 w-3 opacity-50 group-hover:opacity-100 transition-opacity" />
            Incomplete
          </button>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="w-44 rounded-lg border border-gray-6 bg-gray-2 p-3 shadow-lg"
          sideOffset={5}
          align="start"
        >
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-11 mb-1">
                Onboarding Status
              </label>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setSelected(true)}
                  className={`w-full rounded px-3 py-1.5 text-left text-sm transition-colors ${
                    selected
                      ? "bg-green-900/50 text-green-400 border border-green-800"
                      : "text-gray-12 hover:bg-gray-4"
                  }`}
                >
                  Complete
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(false)}
                  className={`w-full rounded px-3 py-1.5 text-left text-sm transition-colors ${
                    !selected
                      ? "bg-yellow-900/50 text-yellow-400 border border-yellow-800"
                      : "text-gray-12 hover:bg-gray-4"
                  }`}
                >
                  Incomplete
                </button>
              </div>
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
                disabled={isSaving || selected === isCompleted}
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
