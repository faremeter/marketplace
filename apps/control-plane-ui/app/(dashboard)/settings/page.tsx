"use client";

import { useAuth } from "@/lib/auth/context";
import useSWR from "swr";
import { api } from "@/lib/api/client";

interface OrgMember {
  id: number;
  email: string;
  role: string;
  joined_at: string;
}

export default function SettingsPage() {
  const { user, currentOrg } = useAuth();

  const { data: members } = useSWR(
    currentOrg ? `/api/organizations/${currentOrg.id}/members` : null,
    api.get<OrgMember[]>,
  );

  const currentRole = user?.organizations.find(
    (o) => o.id === currentOrg?.id,
  )?.role;
  const isOwner = currentRole === "owner";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-12">Settings</h1>
        <p className="text-sm text-gray-11">
          {currentOrg
            ? `Manage settings for ${currentOrg.name}`
            : "Account settings"}
        </p>
      </div>

      <div className="space-y-6">
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
              <label className="block text-sm text-gray-11">Account Type</label>
              <p className="mt-1 text-gray-12">
                {user?.is_admin ? "Administrator" : "User"}
              </p>
            </div>
          </div>
        </section>

        {currentOrg && (
          <>
            <section className="rounded-lg border border-gray-6 bg-gray-2 p-6">
              <h2 className="mb-4 text-lg font-medium text-gray-12">
                Organization Details
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-11">Name</label>
                  <p className="mt-1 text-gray-12">{currentOrg.name}</p>
                </div>
                <div>
                  <label className="block text-sm text-gray-11">
                    Your Role
                  </label>
                  <p className="mt-1 capitalize text-gray-12">{currentRole}</p>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-gray-6 bg-gray-2 p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-medium text-gray-12">Members</h2>
                {isOwner && (
                  <button className="rounded bg-accent-9 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-10">
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
          </>
        )}
      </div>
    </div>
  );
}
