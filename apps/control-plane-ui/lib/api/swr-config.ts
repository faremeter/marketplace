import type { SWRConfiguration } from "swr";
import { ApiError, apiFetch } from "./client";

export const swrConfig: SWRConfiguration = {
  fetcher: (endpoint: string) => apiFetch(endpoint),
  revalidateOnFocus: false,
  revalidateIfStale: true,
  dedupingInterval: 2000,
  errorRetryCount: 3,
  errorRetryInterval: 5000,
  shouldRetryOnError: (error: unknown) => {
    if (error instanceof ApiError) {
      return error.status >= 500;
    }
    return true;
  },
};
