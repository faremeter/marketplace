import useSWR, { mutate as globalMutate } from "swr";
import { useAuth } from "@/lib/auth/context";
import { api } from "@/lib/api/client";

export interface OnboardingStatus {
  onboarding_completed: boolean;
  onboarding_completed_at: string | null;
  steps: {
    wallet: boolean;
    funded: boolean;
    proxy: boolean;
    endpoint: boolean;
  };
  all_steps_complete: boolean;
  first_proxy_id: number | null;
}

export function refreshOnboardingStatus(orgId: number) {
  globalMutate(`/api/organizations/${orgId}/onboarding-status`);
}

export function useOnboarding() {
  const { currentOrg } = useAuth();

  const { data, isLoading, mutate } = useSWR<OnboardingStatus>(
    currentOrg ? `/api/organizations/${currentOrg.id}/onboarding-status` : null,
    api.get,
    { refreshInterval: 2000, revalidateOnFocus: true },
  );

  const completeOnboarding = async () => {
    if (!currentOrg) return;
    await api.post(
      `/api/organizations/${currentOrg.id}/complete-onboarding`,
      {},
    );
    await mutate();
  };

  return {
    status: data,
    isLoading,
    refresh: mutate,
    completeOnboarding,
    showOnboarding: data ? !data.onboarding_completed : false,
  };
}
