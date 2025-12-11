"use client";

import { useAuth } from "@/lib/auth/context";

export default function AdminSettingsPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-12">Admin Settings</h1>
        <p className="text-sm text-gray-11">System configuration</p>
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
              <label className="block text-sm text-gray-11">Role</label>
              <span className="mt-1 inline-flex rounded-full border border-purple-800 bg-purple-900/50 px-2 py-0.5 text-xs text-purple-400">
                Administrator
              </span>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-gray-6 bg-gray-2 p-6">
          <h2 className="mb-4 text-lg font-medium text-gray-12">
            System Configuration
          </h2>
          <p className="text-sm text-gray-11">
            System settings will be available here.
          </p>
        </section>
      </div>
    </div>
  );
}
