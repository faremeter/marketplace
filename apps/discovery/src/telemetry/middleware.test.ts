import "../tests/setup/env.js";
import t from "tap";
import { Hono } from "hono";
import { telemetryMiddleware } from "./middleware.js";
import { _testInspect, _testReset } from "./buffer.js";

function inspect() {
  return _testInspect();
}

function firstEvent() {
  const ev = inspect().events[0];
  if (!ev) throw new Error("expected at least one event");
  return ev;
}

function createApp(
  opts: {
    status?: number;
    searchResultCounts?: { proxies: number; endpoints: number };
  } = {},
) {
  const app = new Hono();
  app.use("*", telemetryMiddleware);

  app.get("/api/v1/search", (c) => {
    if (opts.searchResultCounts) {
      (c as unknown as { set: (k: string, v: unknown) => void }).set(
        "searchResultCounts",
        opts.searchResultCounts,
      );
    }
    return c.json({ ok: true }, (opts.status ?? 200) as 200);
  });

  app.get("/api/v1/proxies/:id", (c) => {
    return c.json({ ok: true }, (opts.status ?? 200) as 200);
  });

  app.get("/api/v1/proxies/:id/endpoints/:eid", (c) => {
    return c.json({ ok: true }, (opts.status ?? 200) as 200);
  });

  app.get("/other", (c) => {
    return c.json({ ok: true });
  });

  return app;
}

t.beforeEach(() => {
  _testReset();
});

await t.test("search telemetry", async (t) => {
  await t.test("records search event with normalized query", async (t) => {
    const app = createApp({ searchResultCounts: { proxies: 1, endpoints: 0 } });
    await app.request("/api/v1/search?q=Solana");
    const state = inspect();
    t.equal(state.bufferSize, 1);
    const ev = firstEvent();
    t.equal(ev.event_type, "search");
    t.equal(ev.event_key, "solana", "query is normalized to lowercase");
  });

  await t.test("normalizes multi-word query (sorted)", async (t) => {
    const app = createApp({ searchResultCounts: { proxies: 1, endpoints: 0 } });
    await app.request("/api/v1/search?q=Hello%20World");
    const ev = firstEvent();
    t.equal(ev.event_key, "hello world", "words are sorted");
  });

  await t.test("skips query shorter than 3 chars", async (t) => {
    const app = createApp({ searchResultCounts: { proxies: 1, endpoints: 0 } });
    await app.request("/api/v1/search?q=ab");
    t.equal(inspect().bufferSize, 0);
  });

  await t.test("skips missing query param", async (t) => {
    const app = createApp();
    await app.request("/api/v1/search");
    t.equal(inspect().bufferSize, 0);
  });

  await t.test("skips special-char-only query", async (t) => {
    const app = createApp({ searchResultCounts: { proxies: 1, endpoints: 0 } });
    await app.request("/api/v1/search?q=!%40%23%24%25");
    t.equal(inspect().bufferSize, 0);
  });

  await t.test("skips search with zero results", async (t) => {
    const app = createApp({ searchResultCounts: { proxies: 0, endpoints: 0 } });
    await app.request("/api/v1/search?q=nonexistent");
    t.equal(inspect().bufferSize, 0);
  });

  await t.test(
    "records search when resultCounts not set (pre-middleware routes)",
    async (t) => {
      const app = createApp();
      await app.request("/api/v1/search?q=solana");
      t.equal(
        inspect().bufferSize,
        1,
        "no resultCounts means skip the zero-result filter",
      );
    },
  );
});

await t.test("view telemetry", async (t) => {
  await t.test("records proxy view with correct proxy_id", async (t) => {
    const app = createApp();
    await app.request("/api/v1/proxies/123");
    const state = inspect();
    t.equal(state.bufferSize, 1);
    const ev = firstEvent();
    t.equal(ev.event_type, "view");
    t.equal(ev.proxy_id, 123);
    t.equal(ev.endpoint_id, undefined);
  });

  await t.test("records proxy+endpoint view with both IDs", async (t) => {
    const app = createApp();
    await app.request("/api/v1/proxies/10/endpoints/99");
    const ev = firstEvent();
    t.equal(ev.event_type, "view");
    t.equal(ev.proxy_id, 10);
    t.equal(ev.endpoint_id, 99);
  });

  await t.test("skips unmatched paths", async (t) => {
    const app = createApp();
    await app.request("/other");
    t.equal(inspect().bufferSize, 0);
  });
});

await t.test("filtering", async (t) => {
  await t.test("skips bot user-agents", async (t) => {
    const app = createApp({ searchResultCounts: { proxies: 1, endpoints: 0 } });
    await app.request("/api/v1/search?q=solana", {
      headers: { "user-agent": "Googlebot/2.1" },
    });
    t.equal(inspect().bufferSize, 0);
  });

  await t.test("skips error responses", async (t) => {
    const errorApp = new Hono();
    errorApp.use("*", telemetryMiddleware);
    errorApp.get("/api/v1/search", (c) => c.json({ error: "bad" }, 400));
    await errorApp.request("/api/v1/search?q=solana");
    t.equal(inspect().bufferSize, 0);
  });
});

await t.test("IP extraction", async (t) => {
  await t.test(
    "uses first IP from x-forwarded-for (dedup proves correct IP used)",
    async (t) => {
      const app = createApp();
      await app.request("/api/v1/proxies/1", {
        headers: { "x-forwarded-for": "10.0.0.1, 10.0.0.2" },
      });
      await app.request("/api/v1/proxies/1", {
        headers: { "x-forwarded-for": "10.0.0.1, 10.0.0.3" },
      });
      const state = inspect();
      t.equal(state.dedupSize, 1, "same first IP deduped");
      t.equal(firstEvent().count, 1, "count stays 1 from dedup");
    },
  );

  await t.test("falls back to x-real-ip", async (t) => {
    const app = createApp();
    await app.request("/api/v1/proxies/2", {
      headers: { "x-real-ip": "10.0.0.5" },
    });
    await app.request("/api/v1/proxies/2", {
      headers: { "x-real-ip": "10.0.0.5" },
    });
    const state = inspect();
    t.equal(state.dedupSize, 1, "same x-real-ip deduped");
  });

  await t.test("uses 'unknown' when no IP headers", async (t) => {
    const app = createApp();
    await app.request("/api/v1/proxies/3");
    await app.request("/api/v1/proxies/3");
    const state = inspect();
    t.equal(state.dedupSize, 1, "both treated as 'unknown' IP, deduped");
  });
});
