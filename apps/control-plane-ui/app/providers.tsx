"use client";

import { SWRConfig } from "swr";
import { swrConfig } from "@/lib/api/swr-config";
import { AuthProvider } from "@/lib/auth/context";
import { ToastProvider } from "@/components/ui/toast";
import { MobileOverlay } from "@/components/ui/mobile-overlay";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={swrConfig}>
      <AuthProvider>
        <ToastProvider>
          <MobileOverlay />
          {children}
        </ToastProvider>
      </AuthProvider>
    </SWRConfig>
  );
}
