import type { Context, Next } from "hono";
import { record } from "./buffer.js";
import { isBot, isValidSearch, hasResults } from "./filters.js";
import { normalizeQuery } from "./normalize.js";

export async function telemetryMiddleware(
  c: Context,
  next: Next,
): Promise<void> {
  await next();

  if (c.res.status >= 400) return;

  const ua = c.req.header("user-agent");
  if (isBot(ua)) return;

  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown";

  const path = c.req.path;

  if (path === "/api/v1/search") {
    const query = c.req.query("q");
    if (!query || !isValidSearch(query)) return;

    const resultCounts = (c.get as (key: string) => unknown)(
      "searchResultCounts",
    ) as { proxies: number; endpoints: number } | undefined;
    if (
      resultCounts &&
      !hasResults(resultCounts.proxies, resultCounts.endpoints)
    )
      return;

    record({ event_type: "search", event_key: normalizeQuery(query) }, ip);
    return;
  }

  const proxyMatch = path.match(/^\/api\/v1\/proxies\/(\d+)/);
  if (proxyMatch && proxyMatch[1]) {
    const proxyId = parseInt(proxyMatch[1], 10);
    if (isNaN(proxyId)) return;

    const endpointMatch = path.match(
      /^\/api\/v1\/proxies\/\d+\/endpoints\/(\d+)/,
    );

    const event =
      endpointMatch && endpointMatch[1]
        ? {
            event_type: "view" as const,
            proxy_id: proxyId,
            endpoint_id: parseInt(endpointMatch[1], 10),
          }
        : { event_type: "view" as const, proxy_id: proxyId };

    record(event, ip);
  }
}
