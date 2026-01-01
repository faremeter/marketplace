export const MAX_PAGINATION_LIMIT = 1000;

export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

export function isExpired(date: Date | string | null | undefined): boolean {
  if (!date) return false;
  return new Date(date) < new Date();
}

export function parsePagination(
  limitStr: string | undefined,
  offsetStr: string | undefined,
  defaultLimit = 50,
): { limit: number; offset: number } {
  return {
    limit: Math.min(
      parseInt(limitStr ?? "") || defaultLimit,
      MAX_PAGINATION_LIMIT,
    ),
    offset: Math.max(parseInt(offsetStr ?? "") || 0, 0),
  };
}
