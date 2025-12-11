"use client";

import { ProtectedRoute } from "@/lib/auth/guard";
import { UserSidebar } from "@/components/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute>
      <div className="flex min-h-screen">
        <UserSidebar />
        <main className="flex-1 overflow-auto bg-gray-1 p-6">{children}</main>
      </div>
    </ProtectedRoute>
  );
}
