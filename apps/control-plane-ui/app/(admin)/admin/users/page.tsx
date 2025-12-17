"use client";

import useSWR from "swr";
import { api } from "@/lib/api/client";

interface User {
  id: number;
  email: string;
  is_admin: boolean;
  email_verified: boolean;
  created_at: string;
}

export default function AdminUsersPage() {
  const { data: users, isLoading } = useSWR(
    "/api/admin/users",
    api.get<User[]>,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-12">Users</h1>
        <p className="text-sm text-gray-11">Manage all users in the system</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-6 border-t-accent-9" />
        </div>
      ) : users?.length ? (
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
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-6 bg-gray-2">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-3">
                  <td className="px-4 py-3 text-sm text-gray-11">{user.id}</td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-6 bg-gray-2 p-6 text-center">
          <p className="text-sm text-gray-11">No users found.</p>
        </div>
      )}
    </div>
  );
}
