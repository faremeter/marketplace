"use client";

import { AdminRoute } from "@/lib/auth/guard";
import { AdminSidebar } from "@/components/sidebar";
import { ImpersonationBanner } from "@/components/impersonation-banner";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminRoute>
      <ImpersonationBanner />
      <div className="flex h-screen overflow-hidden">
        <AdminSidebar />
        <main className="flex-1 overflow-auto bg-gray-1 p-6">{children}</main>
      </div>
    </AdminRoute>
  );
}
