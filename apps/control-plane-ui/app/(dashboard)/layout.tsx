"use client";

import { ProtectedRoute } from "@/lib/auth/guard";
import { UserSidebar } from "@/components/sidebar";
import { OnboardingProvider } from "@/components/onboarding";
import { ImpersonationBanner } from "@/components/impersonation-banner";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute>
      <ImpersonationBanner />
      <div className="flex h-screen overflow-hidden">
        <UserSidebar />
        <main className="flex-1 overflow-auto bg-gray-1 p-6">
          <OnboardingProvider>{children}</OnboardingProvider>
        </main>
      </div>
    </ProtectedRoute>
  );
}
