"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { api } from "@/lib/api/client";
import {
  MagnifyingGlassIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  UploadIcon,
  PlusIcon,
  CaretUpIcon,
  CaretDownIcon,
  CaretSortIcon,
} from "@radix-ui/react-icons";
import { ImportOrgsDialog } from "@/components/admin/import-orgs-dialog";
import { CreateOrgDialog } from "@/components/admin/create-org-dialog";
import { InlineOnboardingEdit } from "@/components/admin/inline-onboarding-edit";
import { ManageMembersDialog } from "@/components/admin/manage-members-dialog";

const PAGE_SIZE = 10;

type SortColumn =
  | "id"
  | "name"
  | "slug"
  | "members"
  | "tenants"
  | "onboarding"
  | "created";
type SortDirection = "asc" | "desc";

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
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [sortColumn, setSortColumn] = useState<SortColumn>("id");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [manageMembersOrg, setManageMembersOrg] = useState<{
    id: number;
    name: string;
  } | null>(null);

  const {
    data: organizations,
    isLoading,
    mutate,
  } = useSWR("/api/admin/organizations", api.get<Organization[]>);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
  };

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) {
      return <CaretSortIcon className="h-3 w-3 text-gray-9" />;
    }
    return sortDirection === "asc" ? (
      <CaretUpIcon className="h-3 w-3" />
    ) : (
      <CaretDownIcon className="h-3 w-3" />
    );
  };

  const sortedOrgs = useMemo(() => {
    const filteredOrgs =
      organizations?.filter(
        (org) =>
          org.name.toLowerCase().includes(search.toLowerCase()) ||
          org.slug.toLowerCase().includes(search.toLowerCase()),
      ) ?? [];

    return [...filteredOrgs].sort((a, b) => {
      let comparison = 0;

      switch (sortColumn) {
        case "id":
          comparison = a.id - b.id;
          break;
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "slug":
          comparison = a.slug.localeCompare(b.slug);
          break;
        case "members":
          comparison = (a.member_count ?? 0) - (b.member_count ?? 0);
          break;
        case "tenants":
          comparison = (a.tenant_count ?? 0) - (b.tenant_count ?? 0);
          break;
        case "onboarding":
          comparison =
            (a.onboarding_completed ? 1 : 0) - (b.onboarding_completed ? 1 : 0);
          break;
        case "created":
          comparison =
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [organizations, search, sortColumn, sortDirection]);

  const totalCount = sortedOrgs.length;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const offset = page * PAGE_SIZE;
  const paginatedOrgs = sortedOrgs.slice(offset, offset + PAGE_SIZE);
  const hasNextPage = page < totalPages - 1;
  const hasPrevPage = page > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-12">Organizations</h1>
          <p className="text-sm text-gray-11">Manage all organizations</p>
        </div>
        <div className="flex items-center gap-3">
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
          <button
            onClick={() => setImportDialogOpen(true)}
            className="inline-flex items-center gap-2 rounded-md border border-gray-6 px-3 py-2 text-sm font-medium text-gray-11 transition-colors hover:bg-gray-3 hover:text-gray-12"
          >
            <UploadIcon className="h-4 w-4" />
            Import
          </button>
          <button
            onClick={() => setCreateDialogOpen(true)}
            className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium text-black shadow-button transition-colors hover:bg-white/90"
          >
            <PlusIcon className="h-4 w-4" />
            Create
          </button>
        </div>
      </div>

      <ImportOrgsDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onSuccess={() => mutate()}
      />

      <CreateOrgDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={() => mutate()}
      />

      {manageMembersOrg && (
        <ManageMembersDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setManageMembersOrg(null);
          }}
          orgId={manageMembersOrg.id}
          orgName={manageMembersOrg.name}
          onSuccess={() => mutate()}
        />
      )}

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
                    <button
                      onClick={() => handleSort("id")}
                      className="inline-flex items-center gap-1 hover:text-gray-12"
                    >
                      ID
                      <SortIcon column="id" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                    <button
                      onClick={() => handleSort("name")}
                      className="inline-flex items-center gap-1 hover:text-gray-12"
                    >
                      Name
                      <SortIcon column="name" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                    <button
                      onClick={() => handleSort("slug")}
                      className="inline-flex items-center gap-1 hover:text-gray-12"
                    >
                      Slug
                      <SortIcon column="slug" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                    <button
                      onClick={() => handleSort("members")}
                      className="inline-flex items-center gap-1 hover:text-gray-12"
                    >
                      Members
                      <SortIcon column="members" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                    <button
                      onClick={() => handleSort("tenants")}
                      className="inline-flex items-center gap-1 hover:text-gray-12"
                    >
                      Tenants
                      <SortIcon column="tenants" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                    <button
                      onClick={() => handleSort("onboarding")}
                      className="inline-flex items-center gap-1 hover:text-gray-12"
                    >
                      Onboarding
                      <SortIcon column="onboarding" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-11">
                    <button
                      onClick={() => handleSort("created")}
                      className="inline-flex items-center gap-1 hover:text-gray-12"
                    >
                      Created
                      <SortIcon column="created" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-11">
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
                      <InlineOnboardingEdit
                        orgId={org.id}
                        orgName={org.name}
                        isCompleted={org.onboarding_completed ?? false}
                        onUpdate={() => mutate()}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-11">
                      {new Date(org.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() =>
                          setManageMembersOrg({ id: org.id, name: org.name })
                        }
                        className="rounded border border-gray-6 px-2 py-1 text-xs text-gray-11 hover:bg-gray-3 hover:text-gray-12"
                      >
                        Members
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
