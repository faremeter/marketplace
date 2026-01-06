import * as fixtures from "../fixtures/corbits.js";

const CORBITS_API_URL =
  process.env.CORBITS_DASH_API_URL || "http://localhost:9999";

let originalFetch: typeof globalThis.fetch;
let mockEnabled = false;

function mockFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const url = typeof input === "string" ? input : input.toString();

  if (!url.startsWith(CORBITS_API_URL)) {
    return originalFetch(input, init);
  }

  const path = url.slice(CORBITS_API_URL.length);

  const nameMatch = path.match(/\/accounts\?name=([^&]+)/);
  if (nameMatch && nameMatch[1]) {
    const name = decodeURIComponent(nameMatch[1]);
    const account = fixtures.accounts.data.find((a) => a.name === name);
    return Promise.resolve(
      new Response(
        JSON.stringify({
          data: account ? [account] : [],
          meta: {
            total: account ? 1 : 0,
            limit: 1,
            offset: 0,
            has_more: false,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
  }

  const addrMatch = path.match(/\/tracked-addresses\?account_id=(\d+)/);
  if (addrMatch && addrMatch[1]) {
    const accountId = parseInt(addrMatch[1]);
    const addresses = fixtures.trackedAddresses.data.filter(
      (a) => a.account_id === accountId,
    );
    return Promise.resolve(
      new Response(
        JSON.stringify({
          data: addresses,
          meta: {
            total: addresses.length,
            limit: 100,
            offset: 0,
            has_more: false,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
  }

  if (path.includes("/transactions")) {
    return Promise.resolve(
      new Response(JSON.stringify(fixtures.transactions), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }

  return Promise.resolve(
    new Response(JSON.stringify(fixtures.emptyResponse), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

export function enableCorbitsMock(): void {
  if (mockEnabled) return;
  originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;
  mockEnabled = true;
}

export function disableCorbitsMock(): void {
  if (!mockEnabled) return;
  globalThis.fetch = originalFetch;
  mockEnabled = false;
}
