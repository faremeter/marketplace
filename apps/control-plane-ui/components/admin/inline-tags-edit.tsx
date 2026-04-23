"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Pencil1Icon, CheckIcon, Cross2Icon } from "@radix-ui/react-icons";
import { api, ApiError } from "@/lib/api/client";
import { useToast } from "@/components/ui/toast";
import { TagsInput } from "@/components/shared/tags-input";

interface InlineTagsEditProps {
  apiEndpoint: string;
  label: string;
  tags: string[];
  onUpdate: () => void;
  disabled?: boolean;
  disabledReason?: string | null;
}

export function InlineTagsEdit({
  apiEndpoint,
  label,
  tags,
  onUpdate,
  disabled,
  disabledReason,
}: InlineTagsEditProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editedTags, setEditedTags] = useState<string[]>(tags);

  const handleSave = async () => {
    const tagsChanged =
      editedTags.length !== tags.length ||
      !editedTags.every((t, i) => t === tags[i]);

    if (!tagsChanged) {
      setIsOpen(false);
      return;
    }

    setIsSaving(true);
    try {
      await api.put(apiEndpoint, { tags: editedTags });
      toast({
        title: "Tags updated",
        description: `Tags for ${label} have been updated.`,
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
        title: "Failed to update tags",
        description: message,
        variant: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpen = (open: boolean) => {
    if (open) {
      setEditedTags(tags);
    }
    setIsOpen(open);
  };

  const tagsChanged =
    editedTags.length !== tags.length ||
    !editedTags.every((t, i) => t === tags[i]);

  return (
    <Popover.Root open={isOpen} onOpenChange={handleOpen}>
      <Popover.Trigger asChild>
        <button
          className={`group flex items-center gap-1.5 rounded px-2 py-1 text-sm text-left ${
            disabled
              ? "opacity-50 cursor-not-allowed"
              : "cursor-pointer hover:bg-gray-4"
          }`}
          disabled={disabled}
          title={disabledReason ?? undefined}
        >
          {tags.length > 0 ? (
            <div className="flex flex-wrap gap-1 max-w-[200px]">
              {tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex rounded-full bg-gray-4 px-2 py-0.5 text-xs text-gray-12"
                >
                  {tag}
                </span>
              ))}
              {tags.length > 3 && (
                <span className="inline-flex rounded-full bg-gray-5 px-2 py-0.5 text-xs text-gray-11">
                  +{tags.length - 3}
                </span>
              )}
            </div>
          ) : (
            <span className="text-gray-9">No tags</span>
          )}
          {!disabled && (
            <Pencil1Icon className="h-3 w-3 text-gray-11 opacity-0 group-hover:opacity-100 flex-shrink-0" />
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="w-80 rounded-lg border border-gray-6 bg-gray-2 p-3 shadow-lg"
          sideOffset={5}
          align="start"
        >
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-11 mb-2">
                Tags for {label}
              </label>
              <TagsInput
                tags={editedTags}
                onChange={setEditedTags}
                disabled={isSaving}
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
                onClick={() => void handleSave()}
                disabled={!tagsChanged || isSaving}
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
