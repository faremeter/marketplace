"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { BetaSignupButton } from "@/components/landing/beta-signup-dialog";

const ProxyVisualization = dynamic(
  () =>
    import("@/components/hero/proxy-visualization").then(
      (mod) => mod.ProxyVisualization,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-[220px] w-full sm:h-[280px] md:h-[350px]" />
    ),
  },
);

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-black">
      <Header />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden">
          {/* Gradient background effect */}
          <div className="absolute inset-0 bg-gradient-to-b from-accent-9/10 via-transparent to-transparent" />

          <div className="relative mx-auto max-w-7xl px-4 pb-24 pt-20 sm:px-6 sm:pb-32 sm:pt-28 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <h1 className="text-4xl font-medium tracking-tight text-white sm:text-5xl lg:text-6xl">
                Turn any API into a
                <br />
                <span className="text-gray-9">Paid x402 Service</span>
              </h1>

              <p className="mx-auto mt-6 max-w-xl text-[17px] leading-relaxed text-gray-11">
                The fastest tool for API monetization for developers. No credit
                cards, no invoices, no delays. Get paid your way.
              </p>

              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                {process.env.NODE_ENV === "development" ? (
                  <Link
                    href="/signup"
                    className="inline-flex h-11 items-center justify-center rounded-md bg-white px-6 text-[14px] font-medium text-black shadow-button transition-colors hover:bg-white/90"
                  >
                    Get Started
                  </Link>
                ) : (
                  <BetaSignupButton className="inline-flex h-11 items-center justify-center rounded-md bg-white px-6 text-[14px] font-medium text-black shadow-button transition-colors hover:bg-white/90">
                    Sign Up for Beta
                  </BetaSignupButton>
                )}
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
                  Call x402 APIs with one line of code
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
                description="Accept payments with any token on Solana, Base, Polygon, and Monad."
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
                description="Anyone with a wallet can pay. No bank accounts or billing needed."
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
                Three simple steps to monetize your API
              </p>
            </div>

            <div className="mx-auto mt-16 grid max-w-4xl gap-8 sm:grid-cols-3">
              <StepCard
                number="1"
                title="Create your account"
                description="Sign up and add your wallet to receive payments."
              />
              <StepCard
                number="2"
                title="Register your API"
                description="Choose a name, provide your backend URL and API token and name your price."
              />
              <StepCard
                number="3"
                title="Start earning in seconds"
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
                Start accepting payments in seconds. No billing required.
              </p>
              <div className="mt-8">
                {process.env.NODE_ENV === "development" ? (
                  <Link
                    href="/signup"
                    className="inline-flex h-11 items-center justify-center rounded-md bg-white px-8 text-[14px] font-medium text-black shadow-button transition-colors hover:bg-white/90"
                  >
                    Get Started
                  </Link>
                ) : (
                  <BetaSignupButton className="inline-flex h-11 items-center justify-center rounded-md bg-white px-8 text-[14px] font-medium text-black shadow-button transition-colors hover:bg-white/90">
                    Sign Up for Beta
                  </BetaSignupButton>
                )}
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
