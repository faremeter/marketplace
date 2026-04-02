"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SITE_NAME } from "@/lib/brand";
import { useAuth } from "@/lib/auth/context";
import { GuestRoute } from "@/lib/auth/guard";
import { ApiError } from "@/lib/api/client";

export default function SignupPage() {
  return (
    <GuestRoute>
      <SignupForm />
    </GuestRoute>
  );
}

function SignupForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { signup } = useAuth();
  const router = useRouter();

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
      await signup(email, password);
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(
          err.data && typeof err.data === "object" && "error" in err.data
            ? String(err.data.error)
            : "Failed to create account",
        );
      } else {
        setError("An error occurred. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-white/10 bg-gray-2 p-8">
      <h1 className="mb-2 text-xl font-medium text-white">
        Create your account
      </h1>
      <p className="mb-6 text-[14px] text-gray-9">
        Get started with {SITE_NAME} API
      </p>

      {error && (
        <div className="mb-4 rounded-md border border-red-500/20 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="mb-1.5 block text-[13px] text-gray-11"
          >
            Email address
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-[14px] text-white placeholder-gray-9 transition-colors focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/20"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="mb-1.5 block text-[13px] text-gray-11"
          >
            Password
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
            Confirm password
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
          {isLoading ? "Creating account..." : "Continue"}
        </button>
      </form>

      <p className="mt-6 text-center text-[13px] text-gray-9">
        Already have an account?{" "}
        <Link href="/login" className="text-white hover:underline">
          Sign in
        </Link>
      </p>
      <p className="mt-2 text-center text-[13px]">
        <Link
          href="/forgot-password"
          className="text-gray-9 hover:text-white transition-colors"
        >
          Forgot password?
        </Link>
      </p>
    </div>
  );
}
