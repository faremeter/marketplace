"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth/context";
import { GuestRoute } from "@/lib/auth/guard";
import { ApiError } from "@/lib/api/client";

export default function LoginPage() {
  return (
    <GuestRoute>
      <LoginForm />
    </GuestRoute>
  );
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(
          err.data && typeof err.data === "object" && "error" in err.data
            ? String(err.data.error)
            : "Invalid email or password",
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
        Sign in to Corbits
      </h1>
      <p className="mb-6 text-[14px] text-gray-9">
        Enter your credentials to continue
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
            className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-[14px] text-white placeholder-gray-9 transition-colors focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/20"
            placeholder="Enter your password"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded-md bg-white px-4 py-2 text-[14px] font-medium text-black shadow-button transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? "Signing in..." : "Continue"}
        </button>
      </form>

      <p className="mt-6 text-center text-[13px] text-gray-9">
        Don&apos;t have an account?{" "}
        <Link
          href="/signup"
          className="text-accent-11 transition-colors hover:text-accent-10"
        >
          Sign up
        </Link>
      </p>
    </div>
  );
}
