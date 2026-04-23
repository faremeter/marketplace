"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Cross2Icon, CopyIcon, CheckIcon } from "@radix-ui/react-icons";
import { api, ApiError } from "@/lib/api/client";
import { useToast } from "@/components/ui/toast";

interface Invitation {
  id: number;
  email: string;
  token: string;
  role: string;
  expires_at: string;
  created_at: string;
}

interface InviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: number;
  onSuccess: () => void;
}

const ROLE_OPTIONS = [
  {
    value: "member",
    label: "Member",
    description: "Can view and use resources",
  },
  {
    value: "admin",
    label: "Admin",
    description: "Can manage resources and invite members",
  },
];

export function InviteMemberDialog({
  open,
  onOpenChange,
  organizationId,
  onSuccess,
}: InviteMemberDialogProps) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [copied, setCopied] = useState(false);

  const resetForm = () => {
    setEmail("");
    setRole("member");
    setError("");
    setInvitation(null);
    setCopied(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  const handleSubmit = async (
    e: React.SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) => {
    e.preventDefault();
    setError("");

    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await api.post<Invitation>(
        `/api/organizations/${organizationId}/invitations`,
        { email: email.trim(), role },
      );
      setInvitation(result);
      onSuccess();
      toast({
        title: "Invitation created",
        description: "Share the link with the invitee.",
        variant: "success",
      });
    } catch (err) {
      if (err instanceof ApiError && err.data) {
        const data = err.data as { error?: string };
        setError(data.error ?? "Failed to create invitation");
      } else {
        setError(
          err instanceof Error ? err.message : "Failed to create invitation",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const inviteUrl = invitation
    ? `${window.location.origin}/invite/${invitation.token}`
    : "";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-gray-6 bg-gray-1 p-6 shadow-xl">
          <div className="mb-6 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-gray-12">
              Invite Member
            </Dialog.Title>
            <Dialog.Close className="rounded p-1 text-gray-11 hover:bg-gray-4 hover:text-gray-12">
              <Cross2Icon className="h-4 w-4" />
            </Dialog.Close>
          </div>

          {!invitation ? (
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm text-gray-11">
                  Email Address <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="colleague@example.com"
                  autoFocus
                  className="w-full rounded-md border border-gray-6 bg-gray-2 px-3 py-2 text-sm text-gray-12 placeholder-gray-9 focus:border-accent-8 focus:outline-none focus:ring-1 focus:ring-accent-8"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm text-gray-11">
                  Role
                </label>
                <div className="space-y-2">
                  {ROLE_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                        role === option.value
                          ? "border-white/20 bg-white/5"
                          : "border-gray-6 hover:border-gray-5"
                      }`}
                    >
                      <input
                        type="radio"
                        name="role"
                        value={option.value}
                        checked={role === option.value}
                        onChange={(e) => setRole(e.target.value)}
                        className="mt-0.5"
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-12">
                          {option.label}
                        </div>
                        <div className="text-xs text-gray-9">
                          {option.description}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
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
                  className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-white/90 disabled:opacity-50"
                >
                  {isSubmitting ? "Creating..." : "Create Invite"}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-11">
                Share this link with{" "}
                <span className="text-gray-12">{invitation.email}</span> to
                invite them to your organization.
              </p>

              <div className="flex items-center gap-2 rounded-md border border-gray-6 bg-gray-2 p-3">
                <input
                  type="text"
                  value={inviteUrl}
                  readOnly
                  className="flex-1 bg-transparent text-sm text-gray-12 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  className="flex h-8 w-8 items-center justify-center rounded text-gray-11 hover:bg-gray-4 hover:text-gray-12"
                >
                  {copied ? (
                    <CheckIcon className="h-4 w-4 text-green-500" />
                  ) : (
                    <CopyIcon className="h-4 w-4" />
                  )}
                </button>
              </div>

              <p className="text-xs text-gray-9">
                This link expires in 7 days.
              </p>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => handleOpenChange(false)}
                  className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-white/90"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
