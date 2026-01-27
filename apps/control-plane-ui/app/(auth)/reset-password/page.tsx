"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { GuestRoute } from "@/lib/auth/guard";
import { api, ApiError } from "@/lib/api/client";

export default function ResetPasswordPage() {
  return (
    <GuestRoute>
      <Suspense fallback={<LoadingState />}>
        <ResetPasswordForm />
      </Suspense>
    </GuestRoute>
  );
}

function LoadingState() {
  return (
    <div className="rounded-lg border border-white/10 bg-gray-2 p-8">
      <div className="flex items-center justify-center py-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-6 border-t-white" />
      </div>
    </div>
  );
}

function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [isValidToken, setIsValidToken] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  useEffect(() => {
    async function validateToken() {
      if (!token) {
        setIsValidating(false);
        return;
      }

      try {
        const response = await api.get<{ valid: boolean }>(
          `/auth/validate-reset-token?token=${token}`,
        );
        setIsValidToken(response.valid);
      } catch {
        setIsValidToken(false);
      } finally {
        setIsValidating(false);
      }
    }

    validateToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setIsLoading(true);

    try {
      await api.post("/auth/reset-password", { token, password });
      setIsSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(
          err.data && typeof err.data === "object" && "error" in err.data
            ? String(err.data.error)
            : "Failed to reset password",
        );
      } else {
        setError("An error occurred. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (isValidating) {
    return <LoadingState />;
  }

  if (!token || !isValidToken) {
    return (
      <div className="rounded-lg border border-white/10 bg-gray-2 p-8">
        <h1 className="mb-2 text-xl font-medium text-white">Invalid link</h1>
        <p className="mb-6 text-[14px] text-gray-9">
          This password reset link is invalid or has expired.
        </p>
        <Link
          href="/forgot-password"
          className="block w-full rounded-md bg-white px-4 py-2 text-center text-[14px] font-medium text-black shadow-button transition-colors hover:bg-white/90"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="rounded-lg border border-white/10 bg-gray-2 p-8">
        <h1 className="mb-2 text-xl font-medium text-white">
          Password reset successful
        </h1>
        <p className="mb-6 text-[14px] text-gray-9">
          Your password has been updated. You can now sign in with your new
          password.
        </p>
        <button
          onClick={() => router.push("/login")}
          className="block w-full rounded-md bg-white px-4 py-2 text-center text-[14px] font-medium text-black shadow-button transition-colors hover:bg-white/90"
        >
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-white/10 bg-gray-2 p-8">
      <h1 className="mb-2 text-xl font-medium text-white">Set new password</h1>
      <p className="mb-6 text-[14px] text-gray-9">
        Enter your new password below
      </p>

      {error && (
        <div className="mb-4 rounded-md border border-red-500/20 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="password"
            className="mb-1.5 block text-[13px] text-gray-11"
          >
            New password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-[14px] text-white placeholder-gray-9 transition-colors focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/20"
            placeholder="At least 8 characters"
          />
        </div>

        <div>
          <label
            htmlFor="confirmPassword"
            className="mb-1.5 block text-[13px] text-gray-11"
          >
            Confirm new password
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-[14px] text-white placeholder-gray-9 transition-colors focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/20"
            placeholder="Confirm your password"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded-md bg-white px-4 py-2 text-[14px] font-medium text-black shadow-button transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? "Resetting..." : "Reset password"}
        </button>
      </form>
    </div>
  );
}
