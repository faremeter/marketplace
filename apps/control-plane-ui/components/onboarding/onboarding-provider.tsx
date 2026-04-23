"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { DOCS_URL } from "@/lib/brand";
import { useAuth } from "@/lib/auth/context";
import {
  useOnboarding,
  refreshOnboardingStatus,
} from "@/lib/hooks/use-onboarding";
import { api } from "@/lib/api/client";
import { GettingStartedDialog } from "./getting-started-dialog";
import { OnboardingChecklist } from "./onboarding-checklist";

const ONBOARDING_HIDDEN_KEY = "onboarding_dialog_hidden";

function getHiddenOrgs(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(ONBOARDING_HIDDEN_KEY);
    return stored ? (JSON.parse(stored) as number[]) : [];
  } catch {
    return [];
  }
}

function setOrgHidden(orgId: number) {
  const hidden = getHiddenOrgs();
  if (!hidden.includes(orgId)) {
    hidden.push(orgId);
    localStorage.setItem(ONBOARDING_HIDDEN_KEY, JSON.stringify(hidden));
  }
}

export function OnboardingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { currentOrg } = useAuth();
  const { status, isLoading, showOnboarding, completeOnboarding } =
    useOnboarding();
  const [dialogDismissed, setDialogDismissed] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [permanentlyHidden, setPermanentlyHidden] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [completionDismissed, setCompletionDismissed] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);

  // Check if all steps are done
  const allStepsDone =
    status?.steps.wallet && status?.steps.funded && status?.steps.proxy;

  useEffect(() => {
    if (currentOrg) {
      const hidden = getHiddenOrgs().includes(currentOrg.id);
      setPermanentlyHidden(hidden);
    }
  }, [currentOrg]);

  useEffect(() => {
    if (
      !isLoading &&
      showOnboarding &&
      !dialogDismissed &&
      !permanentlyHidden
    ) {
      const timer = setTimeout(() => setShowDialog(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [isLoading, showOnboarding, dialogDismissed, permanentlyHidden]);

  // Show forced completion modal when all steps done but onboarding not complete
  useEffect(() => {
    if (
      allStepsDone &&
      showOnboarding &&
      !showCompletionModal &&
      !showDialog &&
      !completionDismissed
    ) {
      setShowCompletionModal(true);
    }
  }, [
    allStepsDone,
    showOnboarding,
    showCompletionModal,
    showDialog,
    completionDismissed,
  ]);

  const handleFinishOnboarding = async () => {
    if (!currentOrg) return;
    setIsFinishing(true);
    setCompletionDismissed(true);
    setShowCompletionModal(false);
    try {
      await api.post(
        `/api/organizations/${currentOrg.id}/complete-onboarding`,
        {},
      );
      refreshOnboardingStatus(currentOrg.id);
    } catch {
      // ignore
    }
    router.push("/dashboard");
  };

  const handleDialogOpenChange = (open: boolean) => {
    setShowDialog(open);
    if (!open) {
      setDialogDismissed(true);
    }
  };

  const handleComplete = async () => {
    await completeOnboarding();
    setShowDialog(false);
    setDialogDismissed(true);
  };

  const handleDontShowAgain = () => {
    if (currentOrg) {
      setOrgHidden(currentOrg.id);
      setPermanentlyHidden(true);
    }
    setShowDialog(false);
    setDialogDismissed(true);
  };

  if (isLoading || !status) {
    return <>{children}</>;
  }

  const showChecklist =
    showOnboarding && (dialogDismissed || permanentlyHidden);

  return (
    <>
      {children}

      {showDialog && (
        <GettingStartedDialog
          open={showDialog}
          onOpenChange={handleDialogOpenChange}
          steps={status.steps}
          allComplete={status.all_steps_complete}
          onComplete={() => void handleComplete()}
          onDontShowAgain={handleDontShowAgain}
        />
      )}

      {showChecklist && (
        <OnboardingChecklist
          steps={status.steps}
          allComplete={status.all_steps_complete}
        />
      )}

      {/* Forced completion modal for users who completed all steps but didn't click Finish */}
      <Dialog.Root open={showCompletionModal}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-brand-orange bg-gray-1 p-6 shadow-xl"
            onPointerDownOutside={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => e.preventDefault()}
          >
            <div className="flex flex-col items-center justify-center py-4 text-center">
              <div className="mb-4 text-5xl">🎉</div>
              <Dialog.Title className="text-xl font-semibold text-gray-12">
                You&apos;re all set!
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-sm text-gray-11 max-w-xs">
                Your API is ready to accept payments. Check out the docs to
                learn more about integrating with your clients.
              </Dialog.Description>
              <div className="mt-6 flex justify-center gap-3">
                <a
                  href={DOCS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border border-gray-6 px-4 py-2 text-sm text-gray-11 transition-colors hover:bg-gray-3 hover:text-gray-12"
                >
                  View Docs
                </a>
                <button
                  onClick={() => void handleFinishOnboarding()}
                  disabled={isFinishing}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-brand-orange px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-orange/90 disabled:opacity-70"
                >
                  Finish
                  {isFinishing ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : (
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M13 7l5 5m0 0l-5 5m5-5H6"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
