"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  CheckCircledIcon,
  CircleIcon,
  Cross2Icon,
} from "@radix-ui/react-icons";
import Link from "next/link";

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  href: string;
  action: string;
}

interface GettingStartedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  steps: {
    wallet: boolean;
    funded: boolean;
    proxy: boolean;
    endpoint: boolean;
  };
  allComplete: boolean;
  onComplete: () => void;
  onDontShowAgain: () => void;
  firstProxyId: number | null;
}

export function GettingStartedDialog({
  open,
  onOpenChange,
  steps,
  allComplete,
  onComplete,
  onDontShowAgain,
  firstProxyId,
}: GettingStartedDialogProps) {
  const onboardingSteps: OnboardingStep[] = [
    {
      id: "wallet",
      title: "Create a Wallet",
      description: "Add your wallet addresses to receive payments",
      completed: steps.wallet,
      href: "/wallets",
      action: "Go to Wallets",
    },
    {
      id: "funded",
      title: "Fund Your Wallet",
      description: "Add SOL for rent and USDC to receive payments",
      completed: steps.funded,
      href: "/wallets",
      action: "Go to Wallets",
    },
    {
      id: "proxy",
      title: "Create a Proxy",
      description: "Set up an x402 proxy for your API",
      completed: steps.proxy,
      href: "/proxies",
      action: "Go to Proxies",
    },
    {
      id: "endpoint",
      title: "Create an Endpoint",
      description: "Define pricing for your API endpoints",
      completed: steps.endpoint,
      href: firstProxyId
        ? `/proxies/${firstProxyId}?tab=endpoints`
        : "/endpoints",
      action: "Go to Endpoints",
    },
  ];

  const handleComplete = () => {
    onComplete();
    onOpenChange(false);
  };

  const handleDontShowAgain = () => {
    onDontShowAgain();
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-gray-6 bg-gray-1 p-6 shadow-xl">
          <div className="mb-6 flex items-center justify-between">
            <Dialog.Title className="text-xl font-semibold text-gray-12">
              {allComplete ? "You're all set!" : "Getting Started"}
            </Dialog.Title>
            <Dialog.Close className="rounded p-1 text-gray-11 hover:bg-gray-4 hover:text-gray-12">
              <Cross2Icon className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <Dialog.Description className="mb-6 text-sm text-gray-11">
            {allComplete
              ? "Congratulations! You've completed all the setup steps."
              : "Complete these steps to get your API monetization running."}
          </Dialog.Description>

          <div className="space-y-3">
            {onboardingSteps.map((step, index) => (
              <div
                key={step.id}
                className={`flex items-start gap-4 rounded-lg border p-4 ${
                  step.completed
                    ? "border-green-800 bg-green-900/20"
                    : "border-gray-6 bg-gray-2"
                }`}
              >
                <div className="flex-shrink-0 pt-0.5">
                  {step.completed ? (
                    <CheckCircledIcon className="h-5 w-5 text-green-400" />
                  ) : (
                    <CircleIcon className="h-5 w-5 text-gray-9" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-11">
                      Step {index + 1}
                    </span>
                  </div>
                  <h3 className="font-medium text-gray-12">{step.title}</h3>
                  <p className="mt-1 text-sm text-gray-11">
                    {step.description}
                  </p>
                  {!step.completed && (
                    <Link
                      href={step.href}
                      onClick={() => onOpenChange(false)}
                      className="mt-2 inline-flex items-center text-sm text-gray-12 hover:text-white"
                    >
                      {step.action} &rarr;
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex justify-center">
            {allComplete ? (
              <button
                onClick={handleComplete}
                className="rounded-md bg-white px-6 py-2 text-sm font-medium text-black shadow-button transition-colors hover:bg-white/90"
              >
                OK
              </button>
            ) : (
              <button
                onClick={handleDontShowAgain}
                className="rounded-md border border-gray-6 bg-gray-2 px-4 py-2 text-sm text-gray-11 transition-colors hover:border-gray-8 hover:bg-gray-3 hover:text-gray-12"
              >
                Don&apos;t show again
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
