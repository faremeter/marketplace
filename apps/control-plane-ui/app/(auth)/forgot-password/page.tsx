"use client";

import { useState } from "react";
import Link from "next/link";
import { GuestRoute } from "@/lib/auth/guard";
import { api } from "@/lib/api/client";

export default function ForgotPasswordPage() {
  return (
    <GuestRoute>
      <ForgotPasswordForm />
    </GuestRoute>
  );
}

function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      await api.post("/api/auth/forgot-password", { email });
      setIsSubmitted(true);
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="rounded-lg border border-white/10 bg-gray-2 p-8">
        <h1 className="mb-2 text-xl font-medium text-white">
          Check your email
        </h1>
        <p className="mb-6 text-[14px] text-gray-9">
          If an account exists for {email}, you will receive a password reset
          link shortly.
        </p>
        <Link
          href="/login"
          className="block w-full rounded-md bg-white px-4 py-2 text-center text-[14px] font-medium text-black shadow-button transition-colors hover:bg-white/90"
        >
          Back to login
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-white/10 bg-gray-2 p-8">
      <h1 className="mb-2 text-xl font-medium text-white">
        Reset your password
      </h1>
      <p className="mb-6 text-[14px] text-gray-9">
        Enter your email and we&apos;ll send you a reset link
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

        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded-md bg-white px-4 py-2 text-[14px] font-medium text-black shadow-button transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? "Sending..." : "Send reset link"}
        </button>
      </form>

      <p className="mt-6 text-center text-[13px] text-gray-9">
        Remember your password?{" "}
        <Link href="/login" className="text-white hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
