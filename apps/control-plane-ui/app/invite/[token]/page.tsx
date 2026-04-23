"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/context";
import { Header, Footer } from "@/components/layout";

interface InvitationDetails {
  id: number;
  email: string;
  role: string;
  organization_name: string;
  expires_at: string;
  currentUserEmail: string | null;
  emailMatch: boolean | null;
}

interface AcceptResponse {
  success: boolean;
  organization: {
    id: number;
    name: string;
    slug: string;
    role: string;
  };
}

type InviteState =
  | { type: "loading" }
  | { type: "error"; message: string }
  | { type: "loaded"; invitation: InvitationDetails }
  | { type: "accepting" }
  | { type: "accepted"; organization: AcceptResponse["organization"] };

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const { user, refresh, setCurrentOrg } = useAuth();
  const token = params.token as string;

  const [state, setState] = useState<InviteState>({ type: "loading" });

  useEffect(() => {
    async function fetchInvitation() {
      try {
        const data = await api.get<InvitationDetails>(
          `/api/invitations/${token}`,
        );
        setState({ type: "loaded", invitation: data });
      } catch (err) {
        if (err instanceof ApiError && err.data) {
          const data = err.data as { error?: string };
          setState({
            type: "error",
            message: data.error ?? "Failed to load invitation",
          });
        } else {
          setState({ type: "error", message: "Failed to load invitation" });
        }
      }
    }
    void fetchInvitation();
  }, [token]);

  const handleAccept = async () => {
    setState({ type: "accepting" });
    try {
      const result = await api.post<AcceptResponse>(
        `/api/invitations/${token}/accept`,
        {},
      );
      setState({ type: "accepted", organization: result.organization });
      await refresh();
      setCurrentOrg(result.organization);
      // Redirect to dashboard after a short delay
      setTimeout(() => {
        router.push("/dashboard");
      }, 2000);
    } catch (err) {
      if (err instanceof ApiError && err.data) {
        const data = err.data as { error?: string };
        setState({
          type: "error",
          message: data.error ?? "Failed to accept invitation",
        });
      } else {
        setState({ type: "error", message: "Failed to accept invitation" });
      }
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-1">
      <Header />
      <main className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="rounded-lg border border-white/10 bg-gray-2 p-8">
            {state.type === "loading" && (
              <div className="text-center">
                <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-gray-6 border-t-white" />
                <p className="text-gray-11">Loading invitation...</p>
              </div>
            )}

            {state.type === "error" && (
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-900/20">
                  <svg
                    className="h-6 w-6 text-red-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </div>
                <h1 className="mb-2 text-xl font-medium text-white">
                  Invitation Error
                </h1>
                <p className="mb-6 text-sm text-gray-11">{state.message}</p>
                <Link
                  href="/login"
                  className="inline-block rounded-md bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-white/90"
                >
                  Go to Login
                </Link>
              </div>
            )}

            {state.type === "loaded" && (
              <>
                <h1 className="mb-2 text-xl font-medium text-white">
                  You&apos;ve been invited
                </h1>
                <p className="mb-6 text-sm text-gray-11">
                  You&apos;ve been invited to join{" "}
                  <span className="font-medium text-white">
                    {state.invitation.organization_name}
                  </span>{" "}
                  as a {state.invitation.role}.
                </p>

                {!user ? (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-11">
                      Please log in with{" "}
                      <span className="font-medium text-white">
                        {state.invitation.email}
                      </span>{" "}
                      to accept this invitation.
                    </p>
                    <Link
                      href={`/login?redirect=/invite/${token}`}
                      className="block w-full rounded-md bg-white px-4 py-2 text-center text-sm font-medium text-black transition-colors hover:bg-white/90"
                    >
                      Log In
                    </Link>
                    <Link
                      href={`/signup?redirect=/invite/${token}&email=${encodeURIComponent(state.invitation.email)}`}
                      className="block w-full rounded-md border border-white/10 px-4 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-white/5"
                    >
                      Create Account
                    </Link>
                  </div>
                ) : state.invitation.emailMatch === false ? (
                  <div className="space-y-4">
                    <div className="rounded-md border border-amber-800 bg-amber-900/20 px-4 py-3 text-sm text-amber-400">
                      This invitation was sent to{" "}
                      <span className="font-medium">
                        {state.invitation.email}
                      </span>
                      , but you&apos;re logged in as{" "}
                      <span className="font-medium">
                        {state.invitation.currentUserEmail}
                      </span>
                      .
                    </div>
                    <p className="text-sm text-gray-11">
                      Please log out and sign in with the correct email to
                      accept this invitation.
                    </p>
                    <Link
                      href="/login"
                      className="block w-full rounded-md bg-white px-4 py-2 text-center text-sm font-medium text-black transition-colors hover:bg-white/90"
                    >
                      Switch Account
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-11">
                      You&apos;re signed in as{" "}
                      <span className="font-medium text-white">
                        {user.email}
                      </span>
                    </p>
                    <button
                      onClick={() => void handleAccept()}
                      className="w-full rounded-md bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-white/90"
                    >
                      Accept Invitation
                    </button>
                  </div>
                )}
              </>
            )}

            {state.type === "accepting" && (
              <div className="text-center">
                <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-gray-6 border-t-white" />
                <p className="text-gray-11">Accepting invitation...</p>
              </div>
            )}

            {state.type === "accepted" && (
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-900/20">
                  <svg
                    className="h-6 w-6 text-green-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <h1 className="mb-2 text-xl font-medium text-white">
                  Welcome to {state.organization.name}!
                </h1>
                <p className="mb-4 text-sm text-gray-11">
                  You&apos;ve successfully joined as a {state.organization.role}
                  .
                </p>
                <p className="text-sm text-gray-9">
                  Redirecting to dashboard...
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
