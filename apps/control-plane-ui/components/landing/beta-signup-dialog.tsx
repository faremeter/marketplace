"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Cross2Icon, CheckIcon } from "@radix-ui/react-icons";

interface BetaSignupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface BetaSignupButtonProps {
  className?: string;
  children: React.ReactNode;
}

export function BetaSignupButton({
  className,
  children,
}: BetaSignupButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      <BetaSignupDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export function BetaSignupDialog({
  open,
  onOpenChange,
}: BetaSignupDialogProps) {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (
    e: React.SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) => {
    e.preventDefault();
    setError("");

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setError("Email is required");
      return;
    }

    if (trimmedEmail.length > 254) {
      setError("Email is too long");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setError("Please enter a valid email");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail }),
      });

      if (!res.ok) {
        const data = (await res.json()) as Record<string, unknown>;
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Failed to join waitlist",
        );
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset state when closing
      setTimeout(() => {
        setEmail("");
        setError("");
        setSuccess(false);
      }, 200);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-white/10 bg-gray-2 p-8 shadow-2xl">
          <Dialog.Close className="absolute right-4 top-4 rounded p-1.5 text-gray-11 transition-colors hover:bg-white/10 hover:text-white">
            <Cross2Icon className="h-4 w-4" />
          </Dialog.Close>

          {success ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-500/20">
                <CheckIcon className="h-7 w-7 text-green-400" />
              </div>
              <Dialog.Title className="text-xl font-medium text-white">
                You&apos;re on the list!
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-[15px] text-gray-9">
                We&apos;ll notify you when beta access is available.
              </Dialog.Description>
              <button
                onClick={() => handleOpenChange(false)}
                className="mt-6 w-full rounded-md bg-white px-4 py-2.5 text-[14px] font-medium text-black shadow-button transition-colors hover:bg-white/90"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              <Dialog.Title className="text-xl font-medium text-white">
                Join the Beta
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-[15px] text-gray-9">
                Be the first to know when we launch. Get early access to
                monetize your APIs.
              </Dialog.Description>

              <form onSubmit={(e) => void handleSubmit(e)} className="mt-6">
                <div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-md border border-white/10 bg-white/5 px-4 py-3 text-[15px] text-white placeholder-gray-9 transition-colors focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/20"
                    autoFocus
                  />
                </div>

                {error && (
                  <p className="mt-2 text-[13px] text-red-400">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-white px-4 py-2.5 text-[14px] font-medium text-black shadow-button transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSubmitting && (
                    <svg
                      className="h-4 w-4 animate-spin"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                  )}
                  {isSubmitting ? "Joining..." : "Join Waitlist"}
                </button>
              </form>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
