"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/context";
import { useToast } from "@/components/ui/toast";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <VerifyEmailContent />
    </Suspense>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="rounded-lg border border-white/10 bg-gray-2 p-8">
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-6 border-t-white" />
        </div>
        <p className="text-center text-[14px] text-gray-9">
          Verifying your email...
        </p>
      </div>
    </div>
  );
}

function VerifyEmailContent() {
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [error, setError] = useState("");
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    async function verify() {
      if (!token) {
        setError("Missing verification token");
        setStatus("error");
        return;
      }

      try {
        await api.post("/api/auth/verify", { token });
        setStatus("success");
        toast({
          title: "Email verified",
          description: "Your email has been verified successfully.",
          variant: "success",
        });
        setTimeout(() => {
          router.push(user ? "/dashboard" : "/login");
        }, 1500);
      } catch {
        setError("Invalid or expired verification link");
        setStatus("error");
      }
    }

    verify();
  }, [token, router, user, toast]);

  if (status === "loading") {
    return <LoadingState />;
  }

  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="rounded-lg border border-white/10 bg-gray-2 p-8 max-w-md">
          <h1 className="mb-2 text-xl font-medium text-white">
            Verification failed
          </h1>
          <p className="mb-6 text-[14px] text-gray-9">{error}</p>
          <Link
            href="/login"
            className="block w-full rounded-md bg-white px-4 py-2 text-center text-[14px] font-medium text-black shadow-button transition-colors hover:bg-white/90"
          >
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="rounded-lg border border-white/10 bg-gray-2 p-8 max-w-md">
        <h1 className="mb-2 text-xl font-medium text-white">Email verified</h1>
        <p className="mb-4 text-[14px] text-gray-9">
          Your email has been verified successfully. Redirecting...
        </p>
        <div className="flex items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-6 border-t-white" />
        </div>
      </div>
    </div>
  );
}
