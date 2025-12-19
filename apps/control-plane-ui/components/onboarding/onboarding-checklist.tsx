"use client";

import { useState, useEffect } from "react";
import {
  CheckCircledIcon,
  CircleIcon,
  Cross2Icon,
} from "@radix-ui/react-icons";
import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";

interface OnboardingChecklistProps {
  steps: {
    wallet: boolean;
    funded: boolean;
    proxy: boolean;
    endpoint: boolean;
  };
  allComplete: boolean;
  onComplete: () => void;
  firstProxyId: number | null;
}

export function OnboardingChecklist({
  steps,
  allComplete,
  onComplete,
  firstProxyId,
}: OnboardingChecklistProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [showCompletionDialog, setShowCompletionDialog] = useState(false);

  useEffect(() => {
    if (showCompletionDialog) {
      import("@hiseb/confetti").then(({ default: confetti }) => {
        const positions = [
          { x: window.innerWidth * 0.5, y: window.innerHeight * 0.4 },
          { x: window.innerWidth * 0.3, y: window.innerHeight * 0.5 },
          { x: window.innerWidth * 0.7, y: window.innerHeight * 0.5 },
        ];
        positions.forEach((position, i) => {
          setTimeout(
            () => confetti({ position, count: 80, velocity: 180 }),
            i * 150,
          );
        });
      });
    }
  }, [showCompletionDialog]);

  const handleFinishClick = () => {
    setShowCompletionDialog(true);
  };

  const handleDismiss = () => {
    setShowCompletionDialog(false);
    onComplete();
  };

  const checklistItems = [
    {
      id: "wallet",
      label: "Create a wallet",
      completed: steps.wallet,
      href: "/wallets",
    },
    {
      id: "funded",
      label: "Fund your wallet",
      completed: steps.funded,
      href: "/wallets",
    },
    {
      id: "proxy",
      label: "Create a proxy",
      completed: steps.proxy,
      href: "/proxies",
    },
    {
      id: "endpoint",
      label: "Create an endpoint",
      completed: steps.endpoint,
      href: firstProxyId
        ? `/proxies/${firstProxyId}?tab=endpoints`
        : "/endpoints",
    },
  ];

  const completedCount = Object.values(steps).filter(Boolean).length;

  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        className="fixed bottom-4 right-4 z-50 rounded-lg border border-gray-6 bg-gray-2 px-4 py-2 text-sm text-gray-12 shadow-lg hover:bg-gray-3"
      >
        Getting Started ({completedCount}/4)
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-72 overflow-hidden rounded-lg border border-gray-6 bg-gray-2 shadow-lg">
      <div className="flex items-center justify-between border-b border-gray-6 px-4 py-3">
        <h3 className="text-sm font-medium text-gray-12">
          {allComplete ? "Setup Complete!" : "Getting Started"}
        </h3>
        <button
          onClick={() => setIsMinimized(true)}
          className="rounded p-1 text-gray-11 hover:bg-gray-4 hover:text-gray-12"
        >
          <Cross2Icon className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="divide-y divide-gray-6">
        {checklistItems.map((item) => {
          const content = (
            <div className="flex items-center gap-3 px-4 py-3">
              {item.completed ? (
                <CheckCircledIcon className="h-4 w-4 flex-shrink-0 text-green-400" />
              ) : (
                <CircleIcon className="h-4 w-4 flex-shrink-0 text-gray-9" />
              )}
              <span
                className={`text-sm ${
                  item.completed ? "text-gray-11 line-through" : "text-gray-12"
                }`}
              >
                {item.label}
              </span>
            </div>
          );

          if (item.completed) {
            return (
              <div key={item.id} className="bg-gray-2">
                {content}
              </div>
            );
          }

          return (
            <Link
              key={item.id}
              href={item.href}
              className="block bg-gray-2 transition-colors hover:bg-gray-3"
            >
              {content}
            </Link>
          );
        })}
        {allComplete && (
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-base">🎉</span>
              <span className="text-sm text-gray-12">All done!</span>
            </div>
            <button
              onClick={handleFinishClick}
              className="rounded-md border border-gray-6 px-4 py-1.5 text-sm text-gray-11 transition-colors hover:bg-gray-3 hover:text-gray-12"
            >
              Finish
            </button>
          </div>
        )}
      </div>

      <Dialog.Root
        open={showCompletionDialog}
        onOpenChange={setShowCompletionDialog}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border border-gray-6 bg-gray-1 p-6 text-center shadow-xl">
            <div className="mb-4 text-4xl">🎉</div>
            <Dialog.Title className="text-xl font-semibold text-gray-12">
              You&apos;re all set!
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-gray-11">
              Your API is ready to accept payments. Check out the docs to learn
              more about integrating with your clients.
            </Dialog.Description>
            <div className="mt-6 flex flex-col gap-3">
              <a
                href="https://docs.corbits.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black shadow-button transition-colors hover:bg-white/90"
              >
                View Documentation
              </a>
              <button
                onClick={handleDismiss}
                className="rounded-md border border-gray-6 px-4 py-2 text-sm text-gray-11 transition-colors hover:bg-gray-3 hover:text-gray-12"
              >
                Got it
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
