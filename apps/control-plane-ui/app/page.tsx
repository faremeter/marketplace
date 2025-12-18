"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useAuth } from "@/lib/auth/context";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";

const ProxyVisualization = dynamic(
  () =>
    import("@/components/hero/proxy-visualization").then(
      (mod) => mod.ProxyVisualization,
    ),
  {
    ssr: false,
    loading: () => <div className="h-[350px] w-full" />,
  },
);

const isDev = process.env.NODE_ENV === "development";

function PlaceholderPage() {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("loading");
    setErrorMessage("");

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:1337"}/api/waitlist`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim() }),
        },
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to join waitlist");
      }

      setStatus("success");
      setEmail("");
    } catch (err) {
      setStatus("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Something went wrong",
      );
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-black">
      <header className="absolute left-0 right-0 top-0 z-10">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-end px-4 sm:px-6 lg:px-8">
          {user ? (
            <Link
              href="/dashboard"
              className="rounded-md bg-white px-3 py-1.5 text-[13px] font-medium text-black transition-colors hover:bg-white/90"
            >
              Dashboard
            </Link>
          ) : (
            <Link
              href="/login"
              className="rounded-md bg-white px-3 py-1.5 text-[13px] font-medium text-black transition-colors hover:bg-white/90"
            >
              Log in
            </Link>
          )}
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4">
        <h1 className="text-4xl font-medium tracking-tight text-white sm:text-5xl lg:text-6xl">
          Corbits API
        </h1>

        {status === "success" ? (
          <div className="mt-10 rounded-lg border border-green-800 bg-green-900/20 px-6 py-4 text-center">
            <p className="text-sm text-green-400">
              You&apos;re on the list! We&apos;ll be in touch soon.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-10 w-full max-w-md">
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
                className="flex-1 rounded-md border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-gray-9 transition-colors focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/20"
              />
              <button
                type="submit"
                disabled={status === "loading"}
                className="rounded-md bg-white px-6 py-3 text-sm font-medium text-black shadow-button transition-colors hover:bg-white/90 disabled:opacity-50"
              >
                {status === "loading" ? "Joining..." : "Join Waitlist"}
              </button>
            </div>
            {status === "error" && (
              <p className="mt-3 text-center text-sm text-red-400">
                {errorMessage}
              </p>
            )}
          </form>
        )}
      </main>
    </div>
  );
}

export default function LandingPage() {
  const [showSignupAlert, setShowSignupAlert] = useState(false);

  if (!isDev) {
    return <PlaceholderPage />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-black">
      {showSignupAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-lg border border-white/10 bg-gray-2 p-6 shadow-2xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent-9/20">
              <svg
                className="h-6 w-6 text-accent-11"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h2 className="mb-2 text-lg font-medium text-white">
              Signups temporarily disabled
            </h2>
            <p className="mb-6 text-[14px] leading-relaxed text-gray-9">
              We&apos;re currently in private beta. Join our waitlist to get
              early access when we open up signups.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowSignupAlert(false)}
                className="flex-1 rounded-md border border-white/10 bg-white/5 px-4 py-2 text-center text-[14px] font-medium text-white transition-colors hover:bg-white/10"
              >
                Close
              </button>
              <a
                href="mailto:waitlist@corbits.dev"
                className="flex-1 rounded-md bg-white px-4 py-2 text-center text-[14px] font-medium text-black shadow-button transition-colors hover:bg-white/90"
              >
                Join waitlist
              </a>
            </div>
          </div>
        </div>
      )}

      <Header onSignupClick={() => setShowSignupAlert(true)} />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden">
          {/* Gradient background effect */}
          <div className="absolute inset-0 bg-gradient-to-b from-accent-9/10 via-transparent to-transparent" />

          <div className="relative mx-auto max-w-7xl px-4 pb-24 pt-20 sm:px-6 sm:pb-32 sm:pt-28 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <h1 className="text-4xl font-medium tracking-tight text-white sm:text-5xl lg:text-6xl">
                API monetization
                <br />
                <span className="text-gray-9">for developers</span>
              </h1>

              <p className="mx-auto mt-6 max-w-xl text-[17px] leading-relaxed text-gray-11">
                Turn any API into a paid service with blockchain micropayments.
                No credit cards, no invoices, no delays. Get paid in USDC
                directly to your wallet.
              </p>

              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <button
                  onClick={() => setShowSignupAlert(true)}
                  className="inline-flex h-11 items-center justify-center rounded-md bg-white px-6 text-[14px] font-medium text-black shadow-button transition-colors hover:bg-white/90"
                >
                  Get started
                </button>
                <Link
                  href="https://docs.corbits.dev"
                  className="inline-flex h-11 items-center justify-center rounded-md border border-white/10 bg-white/5 px-6 text-[14px] font-medium text-white transition-colors hover:bg-white/10"
                >
                  Documentation
                </Link>
              </div>
            </div>

            {/* WebGL Animation */}
            <div className="mx-auto mt-12 max-w-4xl">
              <ProxyVisualization />
            </div>

            {/* Code example */}
            <div className="mx-auto mt-16 max-w-2xl">
              <div className="mb-6 text-center">
                <h3 className="text-lg font-medium text-white">
                  Call proxy APIs with one line of code
                </h3>
              </div>
              <div className="rounded-lg border border-white/10 bg-gray-2 p-1">
                <div className="flex items-center gap-2 border-b border-white/5 px-4 py-2">
                  <div className="h-3 w-3 rounded-full bg-white/10" />
                  <div className="h-3 w-3 rounded-full bg-white/10" />
                  <div className="h-3 w-3 rounded-full bg-white/10" />
                  <span className="ml-2 text-[12px] text-gray-9">index.ts</span>
                </div>
                <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed">
                  <code>
                    <span className="text-purple-400">import</span>
                    <span className="text-white"> {`{`} </span>
                    <span className="text-gray-11">payer</span>
                    <span className="text-white"> {`}`} </span>
                    <span className="text-purple-400">from</span>
                    <span className="text-green-400">
                      {" "}
                      &quot;@faremeter/rides&quot;
                    </span>
                    <span className="text-white">;</span>
                    {"\n\n"}
                    <span className="text-purple-400">await</span>
                    <span className="text-white"> payer.</span>
                    <span className="text-accent-11">addLocalWallet</span>
                    <span className="text-white">(</span>
                    <span className="text-gray-11">process</span>
                    <span className="text-white">.env.</span>
                    <span className="text-gray-11">SOLANA_KEYPAIR_PATH</span>
                    <span className="text-white">);</span>
                    {"\n"}
                    <span className="text-purple-400">await</span>
                    <span className="text-white"> payer.</span>
                    <span className="text-accent-11">addLocalWallet</span>
                    <span className="text-white">(</span>
                    <span className="text-gray-11">process</span>
                    <span className="text-white">.env.</span>
                    <span className="text-gray-11">EVM_PRIVATE_KEY</span>
                    <span className="text-white">);</span>
                    {"\n\n"}
                    <span className="text-purple-400">const</span>
                    <span className="text-white"> req </span>
                    <span className="text-purple-400">=</span>
                    <span className="text-purple-400"> await</span>
                    <span className="text-white"> payer.</span>
                    <span className="text-accent-11">fetch</span>
                    <span className="text-white">(</span>
                    <span className="text-green-400">
                      &quot;http://weather.api.corbits.dev&quot;
                    </span>
                    <span className="text-white">);</span>
                  </code>
                </pre>
              </div>

              {/* Response */}
              <div className="mt-4 rounded-lg border border-white/10 bg-gray-2 p-1">
                <div className="flex items-center gap-2 border-b border-white/5 px-4 py-2">
                  <div className="h-3 w-3 rounded-full bg-white/10" />
                  <div className="h-3 w-3 rounded-full bg-white/10" />
                  <div className="h-3 w-3 rounded-full bg-white/10" />
                  <span className="ml-2 text-[12px] text-gray-9">Response</span>
                </div>
                <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed">
                  <code>
                    <span className="text-white">{`{`}</span>
                    {"\n"}
                    <span className="text-accent-11">
                      {" "}
                      &quot;forecast&quot;
                    </span>
                    <span className="text-white">: </span>
                    <span className="text-green-400">&quot;sunny&quot;</span>
                    <span className="text-white">,</span>
                    {"\n"}
                    <span className="text-accent-11"> &quot;temp&quot;</span>
                    <span className="text-white">: </span>
                    <span className="text-purple-400">72</span>
                    <span className="text-white">,</span>
                    {"\n"}
                    <span className="text-accent-11">
                      {" "}
                      &quot;location&quot;
                    </span>
                    <span className="text-white">: </span>
                    <span className="text-green-400">
                      &quot;San Francisco&quot;
                    </span>
                    {"\n"}
                    <span className="text-white">{`}`}</span>
                  </code>
                </pre>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="border-t border-white/5 py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-medium text-white sm:text-3xl">
                Everything you need to monetize APIs
              </h2>
              <p className="mt-4 text-[15px] text-gray-9">
                Built on the x402 payment standard. Works with any HTTP API.
              </p>
            </div>

            <div className="mx-auto mt-16 grid max-w-5xl gap-8 sm:grid-cols-2 lg:grid-cols-3">
              <FeatureCard
                title="Per-request pricing"
                description="Set prices for individual endpoints. Charge $0.001 or $100 per request. You decide."
              />
              <FeatureCard
                title="Multi-chain payments"
                description="Accept payments on Solana, Base, Polygon, and Monad. USDC stablecoin support."
              />
              <FeatureCard
                title="Instant settlement"
                description="Payments settle on-chain before the request completes. No chargebacks, no disputes."
              />
              <FeatureCard
                title="No integration needed"
                description="Proxy your existing API through Corbits. Zero code changes to your backend."
              />
              <FeatureCard
                title="Global by default"
                description="Anyone with a crypto wallet can pay. No bank accounts or identity verification."
              />
              <FeatureCard
                title="Real-time analytics"
                description="Track every transaction. See revenue per endpoint. Export to your wallet."
              />
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="border-t border-white/5 py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-medium text-white sm:text-3xl">
                How it works
              </h2>
              <p className="mt-4 text-[15px] text-gray-9">
                Three steps to monetize your API
              </p>
            </div>

            <div className="mx-auto mt-16 grid max-w-4xl gap-8 sm:grid-cols-3">
              <StepCard
                number="1"
                title="Create your account"
                description="Sign up and connect your wallet to receive payments."
              />
              <StepCard
                number="2"
                title="Register your API"
                description="Choose a name, provide your backend URL and API token, set endpoint pricing."
              />
              <StepCard
                number="3"
                title="Start earning"
                description="Clients pay per request. USDC flows directly to your wallet."
              />
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="border-t border-white/5 py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-medium text-white sm:text-3xl">
                Ready to monetize your API?
              </h2>
              <p className="mt-4 text-[15px] text-gray-9">
                Start accepting payments in minutes. No credit card required.
              </p>
              <div className="mt-8">
                <button
                  onClick={() => setShowSignupAlert(true)}
                  className="inline-flex h-11 items-center justify-center rounded-md bg-white px-8 text-[14px] font-medium text-black shadow-button transition-colors hover:bg-white/90"
                >
                  Create free account
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function FeatureCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-gray-2 p-6">
      <h3 className="text-[15px] font-medium text-white">{title}</h3>
      <p className="mt-2 text-[13px] leading-relaxed text-gray-9">
        {description}
      </p>
    </div>
  );
}

function StepCard({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[15px] font-medium text-white">
        {number}
      </div>
      <h3 className="mt-4 text-[15px] font-medium text-white">{title}</h3>
      <p className="mt-2 text-[13px] leading-relaxed text-gray-9">
        {description}
      </p>
    </div>
  );
}
