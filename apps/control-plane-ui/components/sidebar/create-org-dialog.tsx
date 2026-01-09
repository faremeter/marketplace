"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Cross2Icon } from "@radix-ui/react-icons";
import { api, ApiError } from "@/lib/api/client";
import { useAuth, type Organization } from "@/lib/auth/context";
import { useToast } from "@/components/ui/toast";

const ORG_NAME_PATTERN = /^[a-zA-Z0-9 -]+$/;

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

function validateOrgName(name: string): string | null {
  if (!ORG_NAME_PATTERN.test(name)) {
    return "Name can only contain letters, numbers, spaces, and hyphens";
  }
  if (/ {2}/.test(name)) {
    return "Name cannot have consecutive spaces";
  }
  if (name.startsWith("-")) {
    return "Name cannot start with a hyphen";
  }
  if (name.endsWith("-")) {
    return "Name cannot end with a hyphen";
  }
  return null;
}

interface CreateOrgDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateOrgDialog({ open, onOpenChange }: CreateOrgDialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { refresh, setCurrentOrg } = useAuth();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setName("");
    setError("");
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Name is required");
      return;
    }

    const validationError = validateOrgName(trimmedName);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      const org = await api.post<Organization>("/api/organizations", {
        name: name.trim(),
      });
      handleOpenChange(false);
      toast({
        title: "Organization created",
        description: `${name.trim()} has been created successfully.`,
        variant: "success",
      });
      await refresh();
      setCurrentOrg(org);
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof ApiError && err.data) {
        const data = err.data as { error?: string };
        setError(data.error || "Failed to create organization");
      } else {
        setError(
          err instanceof Error ? err.message : "Failed to create organization",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-gray-6 bg-gray-1 p-6 shadow-xl">
          <div className="mb-6 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-gray-12">
              Create Organization
            </Dialog.Title>
            <Dialog.Close className="rounded p-1 text-gray-11 hover:bg-gray-4 hover:text-gray-12">
              <Cross2Icon className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm text-gray-11">
                Organization Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Great Organization"
                autoFocus
                className="w-full rounded-md border border-gray-6 bg-gray-2 px-3 py-2 text-sm text-gray-12 placeholder-gray-9 focus:border-accent-8 focus:outline-none focus:ring-1 focus:ring-accent-8"
              />
              {name.trim() && slugify(name) && (
                <p className="mt-2 text-xs text-gray-9">
                  Your proxy URLs will be:{" "}
                  <code className="text-gray-11">
                    *.{slugify(name)}.api.corbits.dev
                  </code>
                </p>
              )}
            </div>

            {error && (
              <div className="rounded-md border border-red-800 bg-red-900/20 px-3 py-2 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                className="rounded-md border border-gray-6 px-4 py-2 text-sm text-gray-11 hover:bg-gray-3"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black shadow-button transition-colors hover:bg-white/90 disabled:opacity-50"
              >
                {isSubmitting ? "Creating..." : "Create"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
