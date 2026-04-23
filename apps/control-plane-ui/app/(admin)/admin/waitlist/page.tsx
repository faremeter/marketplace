"use client";

import { useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/api/client";
import {
  TrashIcon,
  MagnifyingGlassIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@radix-ui/react-icons";

interface WaitlistEntry {
  id: number;
  email: string;
  whitelisted: boolean;
  signed_up: boolean;
  created_at: string;
}

const PAGE_SIZE = 20;

export default function AdminWaitlistPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const {
    data: entries,
    isLoading,
    mutate,
  } = useSWR("/api/admin/waitlist", api.get<WaitlistEntry[]>);

  const handleDelete = async (id: number) => {
    if (!confirm("Remove this email from the waitlist?")) return;

    try {
      await api.delete(`/api/admin/waitlist/${id}`);
      void mutate();
    } catch {
      // Silently fail
    }
  };

  const handleToggleWhitelist = async (id: number, whitelisted: boolean) => {
    try {
      await api.patch(`/api/admin/waitlist/${id}`, { whitelisted });
      void mutate();
    } catch {
      // Silently fail
    }
  };

  const filteredEntries =
    entries?.filter((e) =>
      e.email.toLowerCase().includes(search.toLowerCase()),
    ) ?? [];

  const totalPages = Math.ceil(filteredEntries.length / PAGE_SIZE);
  const paginatedEntries = filteredEntries.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-12">Waitlist</h1>
          <p className="text-sm text-gray-11">
            Beta signup requests ({filteredEntries.length} total)
          </p>
        </div>
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-11" />
          <input
            type="text"
            placeholder="Search emails..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-64 rounded-md border border-gray-6 bg-gray-3 py-2 pl-9 pr-3 text-sm text-gray-12 placeholder:text-gray-11 focus:border-accent-8 focus:outline-none"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-6 border-t-accent-9" />
        </div>
      ) : paginatedEntries.length ? (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-6">
            <table className="w-full min-w-[500px]">
              <thead className="bg-gray-3">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                    Whitelisted
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                    Signed Up
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                    Joined
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-11">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-6 bg-gray-2">
                {paginatedEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-3">
                    <td className="px-4 py-3 text-sm text-gray-12">
                      {entry.email}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() =>
                          void handleToggleWhitelist(
                            entry.id,
                            !entry.whitelisted,
                          )
                        }
                        disabled={entry.signed_up && entry.whitelisted}
                        className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                          entry.whitelisted
                            ? "bg-green-900/30 text-green-400"
                            : "bg-gray-6 text-gray-11 hover:bg-gray-7"
                        } ${entry.signed_up && entry.whitelisted ? "cursor-not-allowed opacity-70" : "hover:bg-green-900/50"}`}
                        title={
                          entry.signed_up && entry.whitelisted
                            ? "Cannot un-whitelist a user who has signed up"
                            : undefined
                        }
                      >
                        {entry.whitelisted ? "Yes" : "No"}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      {entry.signed_up ? (
                        <span className="rounded bg-accent-9/20 px-2 py-1 text-xs font-medium text-accent-11">
                          Yes
                        </span>
                      ) : (
                        <span className="text-sm text-gray-11">No</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-11">
                      {new Date(entry.created_at).toLocaleDateString(
                        undefined,
                        {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        },
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => void handleDelete(entry.id)}
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

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-11">
                Showing {(page - 1) * PAGE_SIZE + 1}-
                {Math.min(page * PAGE_SIZE, filteredEntries.length)} of{" "}
                {filteredEntries.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded-md border border-gray-6 bg-gray-3 p-2 text-gray-11 transition-colors hover:bg-gray-4 hover:text-gray-12 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                </button>
                <span className="text-sm text-gray-11">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="rounded-md border border-gray-6 bg-gray-3 p-2 text-gray-11 transition-colors hover:bg-gray-4 hover:text-gray-12 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRightIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-lg border border-gray-6 bg-gray-2 p-6 text-center">
          <p className="text-sm text-gray-11">
            {search ? "No matching emails found." : "No waitlist signups yet."}
          </p>
        </div>
      )}
    </div>
  );
}
