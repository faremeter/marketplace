"use client";

import { AdminRoute } from "@/lib/auth/guard";
import { AdminSidebar } from "@/components/sidebar";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminRoute>
      <div className="flex h-screen overflow-hidden">
        <AdminSidebar />
        <main className="flex-1 overflow-auto bg-gray-1 p-6">{children}</main>
      </div>
    </AdminRoute>
  );
}
