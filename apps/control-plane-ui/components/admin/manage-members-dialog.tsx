"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import useSWR from "swr";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Cross2Icon,
  TrashIcon,
  PlusIcon,
  EnvelopeClosedIcon,
} from "@radix-ui/react-icons";
import { api, ApiError } from "@/lib/api/client";
import { useToast } from "@/components/ui/toast";

interface Member {
  id: number;
  email: string;
  role: string;
  joined_at: string;
}

interface User {
  id: number;
  email: string;
  is_admin: boolean;
  email_verified: boolean;
  created_at: string;
}

interface ManageMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: number;
  orgName: string;
  onSuccess: () => void;
}

const PAGE_SIZE = 20;

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function ManageMembersDialog({
  open,
  onOpenChange,
  orgId,
  orgName,
  onSuccess,
}: ManageMembersDialogProps) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("member");
  const [error, setError] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [isInvite, setIsInvite] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: members, mutate: mutateMembers } = useSWR<Member[]>(
    open ? `/api/organizations/${orgId}/members` : null,
    api.get,
  );

  const { data: allUsers } = useSWR<User[]>(
    open ? "/api/admin/users" : null,
    api.get,
  );

  const memberIds = useMemo(
    () => new Set(members?.map((m) => m.id) ?? []),
    [members],
  );

  const nonMemberUsers = useMemo(() => {
    if (!allUsers) return [];
    const q = search.toLowerCase().trim();
    return allUsers.filter(
      (u) => !memberIds.has(u.id) && (!q || u.email.toLowerCase().includes(q)),
    );
  }, [allUsers, search, memberIds]);

  const visibleUsers = useMemo(
    () => nonMemberUsers.slice(0, visibleCount),
    [nonMemberUsers, visibleCount],
  );

  const hasMore = nonMemberUsers.length > visibleCount;

  const exactMatch = useMemo(
    () =>
      search.trim()
        ? allUsers?.some(
            (u) => u.email.toLowerCase() === search.toLowerCase().trim(),
          )
        : false,
    [allUsers, search],
  );

  const showInviteOption =
    search.trim() && isValidEmail(search.trim()) && !exactMatch;

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search]);

  const resetForm = () => {
    setSearch("");
    setRole("member");
    setError("");
    setDropdownOpen(false);
    setVisibleCount(PAGE_SIZE);
    setSelectedEmail(null);
    setIsInvite(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
      onSuccess();
    }
    onOpenChange(newOpen);
  };

  const handleSelectUser = (email: string) => {
    setSelectedEmail(email);
    setIsInvite(false);
    setSearch("");
    setDropdownOpen(false);
    setError("");
  };

  const handleSelectInvite = (email: string) => {
    setSelectedEmail(email);
    setIsInvite(true);
    setSearch("");
    setDropdownOpen(false);
    setError("");
  };

  const handleClearSelection = () => {
    setSelectedEmail(null);
    setIsInvite(false);
    setError("");
  };

  const handleAdd = async () => {
    if (!selectedEmail) return;
    setError("");
    setIsAdding(true);
    try {
      if (isInvite) {
        await api.post(`/api/organizations/${orgId}/invitations`, {
          email: selectedEmail,
          role,
        });
        toast({
          title: "Invitation sent",
          description: `Invitation sent to ${selectedEmail}.`,
          variant: "success",
        });
      } else {
        await api.post(`/api/organizations/${orgId}/members`, {
          email: selectedEmail,
          role,
        });
        toast({
          title: "Member added",
          description: `${selectedEmail} added as ${role}.`,
          variant: "success",
        });
        mutateMembers();
      }
      resetForm();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(
          isInvite ? "Failed to send invitation" : "Failed to add member",
        );
      }
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async (member: Member) => {
    setRemovingId(member.id);
    try {
      await api.delete(`/api/organizations/${orgId}/members/${member.id}`);
      toast({
        title: "Member removed",
        description: `${member.email} has been removed.`,
        variant: "success",
      });
      mutateMembers();
    } catch (err) {
      toast({
        title: "Failed to remove member",
        description: err instanceof ApiError ? err.message : "Unknown error",
        variant: "error",
      });
    } finally {
      setRemovingId(null);
    }
  };

  const roleBadgeClass = (r: string) => {
    switch (r) {
      case "owner":
        return "border-amber-800 bg-amber-900/50 text-amber-400";
      case "admin":
        return "border-blue-800 bg-blue-900/50 text-blue-400";
      default:
        return "border-gray-7 bg-gray-3 text-gray-11";
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-gray-6 bg-gray-1 p-6 shadow-xl">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-gray-12">
              Manage Members &mdash; {orgName}
            </Dialog.Title>
            <Dialog.Close className="rounded p-1 text-gray-11 hover:bg-gray-4 hover:text-gray-12">
              <Cross2Icon className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="max-h-64 overflow-y-auto rounded-md border border-gray-6">
            {!members ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-6 border-t-accent-9" />
              </div>
            ) : members.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-11">
                No members
              </p>
            ) : (
              <table className="w-full">
                <thead className="sticky top-0 bg-gray-3">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-11">
                      Email
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-11">
                      Role
                    </th>
                    <th className="w-10 px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-6">
                  {members.map((m) => (
                    <tr key={m.id} className="hover:bg-gray-3">
                      <td className="px-3 py-2 text-sm text-gray-12">
                        {m.email}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs ${roleBadgeClass(m.role)}`}
                        >
                          {m.role}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => handleRemove(m)}
                          disabled={removingId === m.id}
                          className="rounded p-1 text-gray-11 hover:bg-red-900/30 hover:text-red-400 disabled:opacity-50"
                          title={`Remove ${m.email}`}
                        >
                          {removingId === m.id ? (
                            <div className="h-3.5 w-3.5 animate-spin rounded-full border border-gray-6 border-t-gray-11" />
                          ) : (
                            <TrashIcon className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="mt-4 space-y-3">
            <p className="text-sm font-medium text-gray-11">Add member</p>

            {selectedEmail ? (
              <div className="flex items-center gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-gray-6 bg-gray-2 px-3 py-2">
                  {isInvite ? (
                    <EnvelopeClosedIcon className="h-3.5 w-3.5 shrink-0 text-accent-11" />
                  ) : (
                    <PlusIcon className="h-3.5 w-3.5 shrink-0 text-gray-11" />
                  )}
                  <span className="truncate text-sm text-gray-12">
                    {selectedEmail}
                  </span>
                  {isInvite && (
                    <span className="shrink-0 rounded border border-accent-8 bg-accent-3 px-1.5 py-0.5 text-xs text-accent-11">
                      invite
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleClearSelection}
                    className="ml-auto shrink-0 rounded p-0.5 text-gray-11 hover:bg-gray-4 hover:text-gray-12"
                  >
                    <Cross2Icon className="h-3 w-3" />
                  </button>
                </div>
                <Select.Root value={role} onValueChange={setRole}>
                  <Select.Trigger className="inline-flex items-center gap-1 rounded-md border border-gray-6 bg-gray-2 px-2 py-2 text-sm text-gray-12 focus:border-accent-8 focus:outline-none focus:ring-1 focus:ring-accent-8">
                    <Select.Value />
                    <ChevronDownIcon className="h-3.5 w-3.5 text-gray-11" />
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content
                      className="overflow-hidden rounded-md border border-gray-6 bg-gray-2 shadow-lg"
                      position="popper"
                      sideOffset={4}
                    >
                      <Select.Viewport className="p-1">
                        {["member", "admin", "owner"].map((r) => (
                          <Select.Item
                            key={r}
                            value={r}
                            className="relative flex cursor-pointer select-none items-center rounded px-7 py-1.5 text-sm text-gray-12 outline-none hover:bg-gray-4 data-[highlighted]:bg-gray-4"
                          >
                            <Select.ItemIndicator className="absolute left-1.5 inline-flex items-center">
                              <CheckIcon className="h-3.5 w-3.5" />
                            </Select.ItemIndicator>
                            <Select.ItemText>
                              {r.charAt(0).toUpperCase() + r.slice(1)}
                            </Select.ItemText>
                          </Select.Item>
                        ))}
                      </Select.Viewport>
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={isAdding}
                  className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-2 text-sm font-medium text-black shadow-button transition-colors hover:bg-white/90 disabled:opacity-50"
                >
                  {isAdding ? (
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border border-gray-400 border-t-black" />
                  ) : isInvite ? (
                    <EnvelopeClosedIcon className="h-3.5 w-3.5" />
                  ) : (
                    <PlusIcon className="h-3.5 w-3.5" />
                  )}
                  {isInvite ? "Invite" : "Add"}
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setError("");
                    if (!dropdownOpen) setDropdownOpen(true);
                  }}
                  onFocus={() => setDropdownOpen(true)}
                  onBlur={() => {
                    setTimeout(() => setDropdownOpen(false), 150);
                  }}
                  placeholder="Search users or enter email to invite..."
                  disabled={isAdding}
                  className="w-full rounded-md border border-gray-6 bg-gray-2 px-3 py-2 text-sm text-gray-12 placeholder-gray-9 focus:border-accent-8 focus:outline-none focus:ring-1 focus:ring-accent-8"
                />
                {dropdownOpen && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-md border border-gray-6 bg-gray-2 shadow-lg">
                    {visibleUsers.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleSelectUser(u.email)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-12 hover:bg-gray-4"
                      >
                        <PlusIcon className="h-3.5 w-3.5 shrink-0 text-gray-11" />
                        {u.email}
                      </button>
                    ))}
                    {hasMore && (
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                        className="w-full px-3 py-2 text-center text-xs text-gray-11 hover:bg-gray-4"
                      >
                        Show more ({nonMemberUsers.length - visibleCount}{" "}
                        remaining)
                      </button>
                    )}
                    {showInviteOption && (
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleSelectInvite(search.trim())}
                        className="flex w-full items-center gap-2 border-t border-gray-6 px-3 py-2 text-left text-sm text-accent-11 hover:bg-gray-4"
                      >
                        <EnvelopeClosedIcon className="h-3.5 w-3.5 shrink-0" />
                        Invite {search.trim()}
                      </button>
                    )}
                    {visibleUsers.length === 0 && !showInviteOption && (
                      <p className="px-3 py-2 text-center text-xs text-gray-11">
                        {search.trim()
                          ? "No users found"
                          : "No users available"}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="rounded-md border border-red-800 bg-red-900/20 px-3 py-2 text-sm text-red-400">
                {error}
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
