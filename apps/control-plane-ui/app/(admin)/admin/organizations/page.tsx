"use client";

import { useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/api/client";
import {
  ReloadIcon,
  MagnifyingGlassIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@radix-ui/react-icons";
import { useToast } from "@/components/ui/toast";

const PAGE_SIZE = 10;

interface Organization {
  id: number;
  name: string;
  slug: string;
  is_admin: boolean;
  created_at: string;
  member_count?: number;
  tenant_count?: number;
  onboarding_completed?: boolean;
}

export default function AdminOrganizationsPage() {
  const { toast } = useToast();
  const [resettingOrgId, setResettingOrgId] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");

  const {
    data: organizations,
    isLoading,
    mutate,
  } = useSWR("/api/admin/organizations", api.get<Organization[]>);

  const filteredOrgs =
    organizations?.filter(
      (org) =>
        org.name.toLowerCase().includes(search.toLowerCase()) ||
        org.slug.toLowerCase().includes(search.toLowerCase()),
    ) ?? [];
  const totalCount = filteredOrgs.length;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const offset = page * PAGE_SIZE;
  const paginatedOrgs = filteredOrgs.slice(offset, offset + PAGE_SIZE);
  const hasNextPage = page < totalPages - 1;
  const hasPrevPage = page > 0;

  const handleResetOnboarding = async (org: Organization) => {
    setResettingOrgId(org.id);
    try {
      await api.post(`/api/organizations/${org.id}/reset-onboarding`, {});
      await mutate();
      toast({
        title: "Onboarding reset",
        description: `Onboarding has been reset for ${org.name}`,
        variant: "success",
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to reset onboarding",
        variant: "error",
      });
    } finally {
      setResettingOrgId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-12">Organizations</h1>
          <p className="text-sm text-gray-11">Manage all organizations</p>
        </div>
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-11" />
          <input
            type="text"
            placeholder="Search organizations..."
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
      ) : organizations?.length ? (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border border-gray-6">
            <table className="w-full min-w-[700px]">
              <thead className="bg-gray-3">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                    ID
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                    Slug
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                    Members
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                    Tenants
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                    Onboarding
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                    Created
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-6 bg-gray-2">
                {paginatedOrgs.map((org) => (
                  <tr key={org.id} className="hover:bg-gray-3">
                    <td className="px-4 py-3 text-sm text-gray-11">{org.id}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-12">
                      <span className="flex items-center gap-2">
                        {org.name}
                        {org.is_admin && (
                          <span className="rounded-full border border-amber-800 bg-amber-900/50 px-2 py-0.5 text-xs text-amber-400">
                            Admin
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <code className="rounded bg-gray-4 px-2 py-1 text-xs text-gray-11">
                        {org.slug}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-11">
                      {org.member_count ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-11">
                      {org.tenant_count ?? "-"}
                    </td>
                    <td className="px-4 py-3">
                      {org.onboarding_completed ? (
                        <span className="inline-flex rounded-full border border-green-800 bg-green-900/30 px-2 py-0.5 text-xs text-green-400">
                          Complete
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full border border-yellow-800 bg-yellow-900/30 px-2 py-0.5 text-xs text-yellow-400">
                          Incomplete
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-11">
                      {new Date(org.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleResetOnboarding(org)}
                        disabled={resettingOrgId === org.id}
                        className="inline-flex items-center gap-1.5 rounded-md border border-gray-6 px-2.5 py-1.5 text-xs text-gray-11 hover:bg-gray-3 hover:text-gray-12 disabled:opacity-50"
                        title="Reset onboarding"
                      >
                        <ReloadIcon
                          className={`h-3 w-3 ${resettingOrgId === org.id ? "animate-spin" : ""}`}
                        />
                        Reset Onboarding
                      </button>
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
          <p className="text-sm text-gray-11">No organizations found.</p>
        </div>
      )}
    </div>
  );
}
