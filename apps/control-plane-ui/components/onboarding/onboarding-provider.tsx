"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth/context";
import { useOnboarding } from "@/lib/hooks/use-onboarding";
import { GettingStartedDialog } from "./getting-started-dialog";
import { OnboardingChecklist } from "./onboarding-checklist";

const ONBOARDING_HIDDEN_KEY = "onboarding_dialog_hidden";

function getHiddenOrgs(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(ONBOARDING_HIDDEN_KEY);
    return stored ? JSON.parse(stored) : [];
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
  const { currentOrg } = useAuth();
  const { status, isLoading, showOnboarding, completeOnboarding } =
    useOnboarding();
  const [dialogDismissed, setDialogDismissed] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [permanentlyHidden, setPermanentlyHidden] = useState(false);

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
          onComplete={handleComplete}
          onDontShowAgain={handleDontShowAgain}
          firstProxyId={status.first_proxy_id}
        />
      )}

      {showChecklist && (
        <OnboardingChecklist
          steps={status.steps}
          allComplete={status.all_steps_complete}
          onComplete={handleComplete}
          firstProxyId={status.first_proxy_id}
        />
      )}
    </>
  );
}
