export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export interface CursorPaginationParams {
  cursor: number | null;
  limit: number;
}

export interface CursorPaginationResult<T> {
  data: T[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
  };
}

export function parseCursorPagination(
  cursorStr: string | undefined,
  limitStr: string | undefined,
  defaultLimit = DEFAULT_LIMIT,
): CursorPaginationParams {
  const cursor = cursorStr ? parseInt(cursorStr, 10) : null;
  let limit = limitStr ? parseInt(limitStr, 10) : defaultLimit;

  if (isNaN(limit) || limit < 1) {
    limit = defaultLimit;
  }
  if (limit > MAX_LIMIT) {
    limit = MAX_LIMIT;
  }

  return {
    cursor: cursor !== null && !isNaN(cursor) ? cursor : null,
    limit,
  };
}

export function buildCursorResponse<T extends { id: number }>(
  results: T[],
  limit: number,
): CursorPaginationResult<T> {
  const hasMore = results.length > limit;
  const data = hasMore ? results.slice(0, limit) : results;
  const lastItem = data[data.length - 1];
  const nextCursor = hasMore && lastItem ? String(lastItem.id) : null;

  return {
    data,
    pagination: {
      nextCursor,
      hasMore,
    },
  };
}
