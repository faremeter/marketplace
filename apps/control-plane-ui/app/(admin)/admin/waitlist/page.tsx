"use client";

import useSWR from "swr";
import { api } from "@/lib/api/client";
import { TrashIcon } from "@radix-ui/react-icons";

interface WaitlistEntry {
  id: number;
  email: string;
  created_at: string;
}

export default function AdminWaitlistPage() {
  const {
    data: entries,
    isLoading,
    mutate,
  } = useSWR("/api/admin/waitlist", api.get<WaitlistEntry[]>);

  const handleDelete = async (id: number) => {
    if (!confirm("Remove this email from the waitlist?")) return;

    try {
      await api.delete(`/api/admin/waitlist/${id}`);
      mutate();
    } catch {
      // Silently fail
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-12">Waitlist</h1>
          <p className="text-sm text-gray-11">
            Beta signup requests ({entries?.length ?? 0} total)
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-6 border-t-accent-9" />
        </div>
      ) : entries?.length ? (
        <div className="overflow-x-auto rounded-lg border border-gray-6">
          <table className="w-full min-w-[500px]">
            <thead className="bg-gray-3">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                  Signed Up
                </th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-11">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-6 bg-gray-2">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-gray-3">
                  <td className="px-4 py-3 text-sm text-gray-12">
                    {entry.email}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-11">
                    {new Date(entry.created_at).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(entry.id)}
                      className="rounded p-1.5 text-gray-11 transition-colors hover:bg-red-900/30 hover:text-red-400"
                      title="Remove from waitlist"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-6 bg-gray-2 p-6 text-center">
          <p className="text-sm text-gray-11">No waitlist signups yet.</p>
        </div>
      )}
    </div>
  );
}
