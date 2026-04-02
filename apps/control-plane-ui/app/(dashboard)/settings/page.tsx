"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/context";
import useSWR from "swr";
import { api, ApiError } from "@/lib/api/client";
import { InviteMemberDialog } from "@/components/settings/invite-member-dialog";
import { UpdatePasswordDialog } from "@/components/settings/update-password-dialog";
import { Cross2Icon, CopyIcon, CheckIcon } from "@radix-ui/react-icons";
import { useToast } from "@/components/ui/toast";
import * as Dialog from "@radix-ui/react-dialog";

interface OrgMember {
  id: number;
  email: string;
  role: string;
  joined_at: string;
}

interface Invitation {
  id: number;
  email: string;
  role: string;
  token: string;
  expires_at: string;
  created_at: string;
  invited_by_email: string | null;
}

export default function SettingsPage() {
  const router = useRouter();
  const { user, currentOrg, refresh, setCurrentOrg } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"organization" | "account">(
    "organization",
  );
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: members } = useSWR(
    currentOrg ? `/api/organizations/${currentOrg.id}/members` : null,
    api.get<OrgMember[]>,
  );

  const { data: invitations, mutate: mutateInvitations } = useSWR(
    currentOrg ? `/api/organizations/${currentOrg.id}/invitations` : null,
    api.get<Invitation[]>,
  );

  const currentRole = user?.organizations.find(
    (o) => o.id === currentOrg?.id,
  )?.role;
  const isOwnerOrAdmin = currentRole === "owner" || currentRole === "admin";
  const isOwner = currentRole === "owner";

  const handleDeleteOrg = async () => {
    if (!currentOrg || deleteConfirmation !== currentOrg.name) return;

    setIsDeleting(true);
    try {
      await api.delete(`/api/organizations/${currentOrg.id}`);
      setDeleteDialogOpen(false);
      toast({
        title: "Organization deleted",
        description: `${currentOrg.name} has been permanently deleted.`,
        variant: "success",
      });
      await refresh();
      setCurrentOrg(null);
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof ApiError && err.data) {
        const data = err.data as { error?: string };
        toast({
          title: "Cannot delete organization",
          description: data.error || "Failed to delete organization",
          variant: "error",
        });
      } else {
        toast({
          title: "Error",
          description:
            err instanceof Error
              ? err.message
              : "Failed to delete organization",
          variant: "error",
        });
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCopyInviteLink = async (invitation: Invitation) => {
    const url = `${window.location.origin}/invite/${invitation.token}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(invitation.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCancelInvitation = async (invitationId: number) => {
    if (!currentOrg) return;
    try {
      await api.delete(
        `/api/organizations/${currentOrg.id}/invitations/${invitationId}`,
      );
      mutateInvitations();
      toast({
        title: "Invitation cancelled",
        description: "The invitation has been removed.",
        variant: "success",
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to cancel invitation",
        variant: "error",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-12">Settings</h1>
        <p className="text-sm text-gray-11">
          {currentOrg ? (
            <>
              Manage settings for{" "}
              <span className="text-brand-orange">{currentOrg.name}</span>
            </>
          ) : (
            "Account settings"
          )}
        </p>
      </div>

      {currentOrg && (
        <div className="flex gap-1 border-b border-gray-6">
          <button
            onClick={() => setActiveTab("organization")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "organization"
                ? "border-b-2 border-brand-orange text-brand-orange"
                : "text-gray-11 hover:text-gray-12"
            }`}
          >
            Organization
          </button>
          <button
            onClick={() => setActiveTab("account")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "account"
                ? "border-b-2 border-brand-orange text-brand-orange"
                : "text-gray-11 hover:text-gray-12"
            }`}
          >
            Account
          </button>
        </div>
      )}

      <div className="space-y-6">
        {activeTab === "account" && (
          <>
            <section className="rounded-lg border border-gray-6 bg-gray-2 p-6">
              <h2 className="mb-4 text-lg font-medium text-gray-12">
                Account Information
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-11">Email</label>
                  <p className="mt-1 text-gray-12">{user?.email}</p>
                </div>
                <div>
                  <label className="block text-sm text-gray-11">
                    Account Type
                  </label>
                  <div className="mt-1">
                    {user?.is_admin ? (
                      <span className="rounded-full border border-amber-800 bg-amber-900/50 px-2 py-0.5 text-xs text-amber-400">
                        Administrator
                      </span>
                    ) : (
                      <span className="rounded-full bg-gray-4 px-2 py-0.5 text-xs text-gray-11">
                        User
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-gray-6 bg-gray-2 p-6">
              <h2 className="mb-4 text-lg font-medium text-gray-12">
                Password
              </h2>
              <p className="mb-4 text-sm text-gray-11">
                Update your password to keep your account secure.
              </p>
              <button
                onClick={() => setPasswordDialogOpen(true)}
                className="rounded-md border border-gray-6 px-4 py-2 text-sm font-medium text-gray-12 transition-colors hover:bg-gray-3"
              >
                Update Password
              </button>
            </section>

            <UpdatePasswordDialog
              open={passwordDialogOpen}
              onOpenChange={setPasswordDialogOpen}
            />
          </>
        )}

        {activeTab === "organization" && currentOrg && (
          <>
            <section className="rounded-lg border border-gray-6 bg-gray-2 p-6">
              <h2 className="mb-4 text-lg font-medium text-gray-12">
                Organization Details
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-11">Name</label>
                  <p className="mt-1 text-gray-12">
                    {currentOrg.name}
                    {currentOrg.slug !== currentOrg.name && (
                      <span className="font-mono text-gray-9">
                        {" "}
                        ({currentOrg.slug})
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <label className="block text-sm text-gray-11">
                    Your Role
                  </label>
                  <div className="mt-1">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs capitalize ${
                        currentRole === "owner"
                          ? "border border-purple-800 bg-purple-900/50 text-purple-400"
                          : currentRole === "admin"
                            ? "border border-blue-800 bg-blue-900/50 text-blue-400"
                            : "bg-gray-4 text-gray-11"
                      }`}
                    >
                      {currentRole}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-gray-6 bg-gray-2 p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-medium text-gray-12">Members</h2>
                {isOwnerOrAdmin && (
                  <button
                    onClick={() => setInviteDialogOpen(true)}
                    className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-white/90"
                  >
                    Invite Member
                  </button>
                )}
              </div>
              {members?.length ? (
                <ul className="divide-y divide-gray-6">
                  {members.map((member) => (
                    <li
                      key={member.id}
                      className="flex items-center justify-between py-3"
                    >
                      <div>
                        <p className="text-sm text-gray-12">{member.email}</p>
                        <p className="text-xs text-gray-9">
                          Joined{" "}
                          {new Date(member.joined_at).toLocaleDateString()}
                        </p>
                      </div>
                      <span className="rounded-full bg-gray-4 px-2 py-0.5 text-xs capitalize text-gray-11">
                        {member.role}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-11">No members found.</p>
              )}
            </section>

            {isOwnerOrAdmin && invitations && invitations.length > 0 && (
              <section className="rounded-lg border border-gray-6 bg-gray-2 p-6">
                <h2 className="mb-4 text-lg font-medium text-gray-12">
                  Pending Invitations
                </h2>
                <ul className="divide-y divide-gray-6">
                  {invitations.map((invitation) => (
                    <li
                      key={invitation.id}
                      className="flex items-center justify-between py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-12">
                          {invitation.email}
                        </p>
                        <p className="text-xs text-gray-9">
                          Expires{" "}
                          {new Date(invitation.expires_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleCopyInviteLink(invitation)}
                          className="flex items-center gap-1 rounded px-2 py-1 text-gray-11 hover:bg-gray-4 hover:text-gray-12"
                          title="Copy invite link"
                        >
                          {copiedId === invitation.id ? (
                            <>
                              <CheckIcon className="h-4 w-4 text-green-500" />
                              <span className="text-xs text-green-500">
                                Copied!
                              </span>
                            </>
                          ) : (
                            <CopyIcon className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          onClick={() => handleCancelInvitation(invitation.id)}
                          className="flex h-8 w-8 items-center justify-center rounded text-gray-11 hover:bg-red-900/20 hover:text-red-400"
                          title="Cancel invitation"
                        >
                          <Cross2Icon className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <InviteMemberDialog
              open={inviteDialogOpen}
              onOpenChange={setInviteDialogOpen}
              organizationId={currentOrg.id}
              onSuccess={() => mutateInvitations()}
            />

            {isOwner && (
              <section className="rounded-lg border border-red-900/50 bg-red-950/20 p-6">
                <h2 className="mb-2 text-lg font-medium text-red-400">
                  Danger Zone
                </h2>
                <p className="mb-4 text-sm text-gray-11">
                  Once you delete an organization, there is no going back. All
                  wallets will be permanently deleted.
                </p>
                <button
                  onClick={() => setDeleteDialogOpen(true)}
                  className="rounded-md border border-red-800 bg-red-900/30 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-900/50"
                >
                  Delete Organization
                </button>
              </section>
            )}

            <Dialog.Root
              open={deleteDialogOpen}
              onOpenChange={(open) => {
                setDeleteDialogOpen(open);
                if (!open) setDeleteConfirmation("");
              }}
            >
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
                <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-gray-6 bg-gray-1 p-6 shadow-xl">
                  <div className="mb-4 flex items-center justify-between">
                    <Dialog.Title className="text-lg font-semibold text-gray-12">
                      Delete Organization
                    </Dialog.Title>
                    <Dialog.Close className="rounded p-1 text-gray-11 hover:bg-gray-4 hover:text-gray-12">
                      <Cross2Icon className="h-4 w-4" />
                    </Dialog.Close>
                  </div>

                  <div className="space-y-4">
                    <p className="text-sm text-gray-11">
                      This action cannot be undone. This will permanently delete{" "}
                      <span className="font-medium text-gray-12">
                        {currentOrg.name}
                      </span>{" "}
                      and remove all members.
                    </p>

                    <p className="text-sm text-gray-11">
                      Please type{" "}
                      <span className="font-mono text-gray-12">
                        {currentOrg.name}
                      </span>{" "}
                      to confirm.
                    </p>

                    <input
                      type="text"
                      value={deleteConfirmation}
                      onChange={(e) => setDeleteConfirmation(e.target.value)}
                      placeholder={currentOrg.name}
                      className="w-full rounded-md border border-gray-6 bg-gray-2 px-3 py-2 text-sm text-gray-12 placeholder-gray-9 focus:border-red-800 focus:outline-none focus:ring-1 focus:ring-red-800"
                    />

                    <div className="flex justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setDeleteDialogOpen(false)}
                        className="rounded-md border border-gray-6 px-4 py-2 text-sm text-gray-11 hover:bg-gray-3"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleDeleteOrg}
                        disabled={
                          isDeleting || deleteConfirmation !== currentOrg.name
                        }
                        className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                      >
                        {isDeleting ? "Deleting..." : "Delete Organization"}
                      </button>
                    </div>
                  </div>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          </>
        )}
      </div>
    </div>
  );
}
