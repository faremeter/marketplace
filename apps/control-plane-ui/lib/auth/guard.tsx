"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./context";

interface GuardProps {
  children: ReactNode;
  fallback?: ReactNode;
}

function LoadingSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-6 border-t-accent-9" />
    </div>
  );
}

export function ProtectedRoute({ children, fallback }: GuardProps) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login");
    }
  }, [isLoading, user, router]);

  if (isLoading) {
    return fallback ?? <LoadingSpinner />;
  }

  if (!user) {
    return fallback ?? <LoadingSpinner />;
  }

  return <>{children}</>;
}

export function AdminRoute({ children, fallback }: GuardProps) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.push("/login");
      } else if (!user.is_admin) {
        router.push("/dashboard");
      }
    }
  }, [isLoading, user, router]);

  if (isLoading) {
    return fallback ?? <LoadingSpinner />;
  }

  if (!user || !user.is_admin) {
    return fallback ?? <LoadingSpinner />;
  }

  return <>{children}</>;
}

export function GuestRoute({ children, fallback }: GuardProps) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user) {
      router.push("/dashboard");
    }
  }, [isLoading, user, router]);

  if (isLoading) {
    return fallback ?? <LoadingSpinner />;
  }

  if (user) {
    return fallback ?? <LoadingSpinner />;
  }

  return <>{children}</>;
}
