"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/context";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";

export function ImpersonationBanner() {
  const { user, stopImpersonation } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [exiting, setExiting] = useState(false);

  if (!user?.impersonating) return null;

  const handleExit = async () => {
    setExiting(true);
    try {
      await stopImpersonation();
      router.push("/admin/users");
    } catch {
      toast({ title: "Failed to exit impersonation", variant: "error" });
      setExiting(false);
    }
  };

  return (
    <>
      <div className="fixed left-0 right-0 top-0 z-50 flex items-center justify-center gap-3 bg-amber-600 px-4 py-2 text-sm font-medium text-white">
        <span>
          Viewing as <strong>{user.email}</strong>
        </span>
        <button
          onClick={() => void handleExit()}
          disabled={exiting}
          className="rounded border border-white/30 px-2.5 py-0.5 text-xs font-medium transition-colors hover:bg-white/20 disabled:opacity-50"
        >
          {exiting ? "Exiting..." : "Exit"}
        </button>
      </div>
      <div className="h-9" />
    </>
  );
}
