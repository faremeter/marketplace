"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/context";
import { useToast } from "@/components/ui/toast";
import {
  MagnifyingGlassIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@radix-ui/react-icons";

const PAGE_SIZE = 10;

interface User {
  id: number;
  email: string;
  is_admin: boolean;
  email_verified: boolean;
  created_at: string;
}

export default function AdminUsersPage() {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [impersonatingId, setImpersonatingId] = useState<number | null>(null);
  const { user: currentUser, refresh, setCurrentOrg } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const { data: users, isLoading } = useSWR(
    "/api/admin/users",
    api.get<User[]>,
  );

  const filteredUsers =
    users?.filter((user) =>
      user.email.toLowerCase().includes(search.toLowerCase()),
    ) ?? [];
  const totalCount = filteredUsers.length;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const offset = page * PAGE_SIZE;
  const paginatedUsers = filteredUsers.slice(offset, offset + PAGE_SIZE);
  const hasNextPage = page < totalPages - 1;
  const hasPrevPage = page > 0;

  const handleImpersonate = async (userId: number) => {
    setImpersonatingId(userId);
    try {
      await api.post(`/api/admin/impersonate/${userId}`, {});
      setCurrentOrg(null);
      await refresh();
      router.push("/dashboard");
    } catch {
      toast({ title: "Failed to impersonate user", variant: "error" });
      setImpersonatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-12">Users</h1>
          <p className="text-sm text-gray-11">Manage all users in the system</p>
        </div>
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-11" />
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="w-64 rounded-md border border-gray-6 bg-gray-3 py-2 pl-9 pr-3 text-sm text-gray-12 placeholder:text-gray-11 focus:border-accent-8 focus:outline-none"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-6 border-t-accent-9" />
        </div>
      ) : users?.length ? (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border border-gray-6">
            <table className="w-full min-w-[600px]">
              <thead className="bg-gray-3">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                    ID
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                    Role
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                    Created
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-11">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-6 bg-gray-2">
                {paginatedUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-3">
                    <td className="px-4 py-3 text-sm text-gray-11">
                      {user.id}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-12">
                      {user.email}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${
                          user.email_verified
                            ? "border-green-800 bg-green-900/50 text-green-400"
                            : "border-yellow-800 bg-yellow-900/50 text-yellow-400"
                        }`}
                      >
                        {user.email_verified ? "Verified" : "Pending"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${
                          user.is_admin
                            ? "border-purple-800 bg-purple-900/50 text-purple-400"
                            : "border-gray-700 bg-gray-800/50 text-gray-400"
                        }`}
                      >
                        {user.is_admin ? "Admin" : "User"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-11">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {user.id !== currentUser?.id && (
                        <button
                          onClick={() => handleImpersonate(user.id)}
                          disabled={
                            !!currentUser?.impersonating ||
                            impersonatingId === user.id
                          }
                          className="rounded border border-gray-6 px-2.5 py-1 text-xs text-gray-11 transition-colors hover:bg-gray-4 hover:text-gray-12 disabled:opacity-50"
                        >
                          {impersonatingId === user.id
                            ? "Switching..."
                            : "Impersonate"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-11">
                Showing {offset + 1}-{Math.min(offset + PAGE_SIZE, totalCount)}{" "}
                of {totalCount}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => p - 1)}
                  disabled={!hasPrevPage}
                  className="rounded p-1.5 text-gray-11 hover:bg-gray-4 hover:text-gray-12 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                </button>
                <span className="text-sm text-gray-11">
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!hasNextPage}
                  className="rounded p-1.5 text-gray-11 hover:bg-gray-4 hover:text-gray-12 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRightIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-gray-6 bg-gray-2 p-6 text-center">
          <p className="text-sm text-gray-11">No users found.</p>
        </div>
      )}
    </div>
  );
}
