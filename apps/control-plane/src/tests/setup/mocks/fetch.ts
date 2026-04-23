// Mock for global fetch

type FetchHandler = (
  url: string,
  opts?: RequestInit,
) => Promise<Response> | Response;

const handlers = new Map<string, FetchHandler>();

/**
 * Register a mock handler for URLs matching a pattern.
 * The pattern is matched using string.includes().
 */
export function mockFetch(urlPattern: string, handler: FetchHandler) {
  handlers.set(urlPattern, handler);
}

/**
 * Clear all registered fetch mocks.
 */
export function resetFetchMocks() {
  handlers.clear();
}

/**
 * Create a mock fetch function that uses registered handlers.
 * Throws an error for unmocked URLs.
 */
export function createMockFetch(): typeof fetch {
  return async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

    for (const [pattern, handler] of handlers) {
      if (url.includes(pattern)) {
        return handler(url, init);
      }
    }

    throw new Error(`Unmocked fetch: ${url}`);
  };
}

/**
 * Helper to create a JSON response.
 */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Helper to create an error response.
 */
export function errorResponse(message: string, status = 500): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
