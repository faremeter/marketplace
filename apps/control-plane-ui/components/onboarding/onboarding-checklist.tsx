"use client";

import { useState } from "react";
import {
  CheckCircledIcon,
  CircleIcon,
  Cross2Icon,
} from "@radix-ui/react-icons";
import Link from "next/link";

interface OnboardingChecklistProps {
  steps: {
    wallet: boolean;
    funded: boolean;
    proxy: boolean;
    endpoint: boolean;
  };
  allComplete: boolean;
}

export function OnboardingChecklist({
  steps,
  allComplete,
}: OnboardingChecklistProps) {
  const [isMinimized, setIsMinimized] = useState(false);

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
  ];

  const completedCount = [steps.wallet, steps.funded, steps.proxy].filter(
    Boolean,
  ).length;

  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        className="fixed bottom-4 right-4 z-50 rounded-lg border border-gray-6 bg-gray-2 px-4 py-2 text-sm text-gray-12 shadow-lg hover:bg-gray-3"
      >
        Getting Started ({completedCount}/3)
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
      </div>
    </div>
  );
}
