import "../tests/setup/env.js";
import t from "tap";
import {
  record,
  flush,
  toBucket,
  startFlushTimer,
  stopFlushTimer,
  _testInspect,
  _testReset,
} from "./buffer.js";

const BUCKET_MS = 15 * 60 * 1000;

function inspect() {
  return _testInspect();
}

function firstEvent() {
  const ev = inspect().events[0];
  if (!ev) throw new Error("expected at least one event");
  return ev;
}

await t.test("toBucket", async (t) => {
  await t.test("aligns to 15-minute boundary", async (t) => {
    const bucket = toBucket(new Date("2025-01-01T10:07:30Z"));
    t.equal(bucket.getTime(), new Date("2025-01-01T10:00:00Z").getTime());
  });

  await t.test("keeps exact boundary unchanged", async (t) => {
    const bucket = toBucket(new Date("2025-01-01T10:15:00Z"));
    t.equal(bucket.getTime(), new Date("2025-01-01T10:15:00Z").getTime());
  });

  await t.test("rounds down just before next boundary", async (t) => {
    const bucket = toBucket(new Date("2025-01-01T10:14:59.999Z"));
    t.equal(bucket.getTime(), new Date("2025-01-01T10:00:00Z").getTime());
  });

  await t.test("handles midnight boundary", async (t) => {
    const bucket = toBucket(new Date("2025-01-01T00:00:00Z"));
    t.equal(bucket.getTime(), new Date("2025-01-01T00:00:00Z").getTime());
  });

  await t.test("handles end of day", async (t) => {
    const bucket = toBucket(new Date("2025-01-01T23:59:59Z"));
    t.equal(bucket.getTime(), new Date("2025-01-01T23:45:00Z").getTime());
  });

  await t.test("result is always aligned to BUCKET_MS", async (t) => {
    const bucket = toBucket();
    t.equal(bucket.getTime() % BUCKET_MS, 0);
  });
});

await t.test("record and _testInspect", async (t) => {
  t.beforeEach(() => {
    _testReset();
  });

  await t.test("records a search event with correct fields", async (t) => {
    record({ event_type: "search", event_key: "solana" }, "1.2.3.4");
    const state = inspect();
    t.equal(state.bufferSize, 1);
    t.equal(state.dedupSize, 1);
    const ev = firstEvent();
    t.equal(ev.event_type, "search");
    t.equal(ev.event_key, "solana");
    t.equal(ev.count, 1);
  });

  await t.test("deduplicates same event + IP (count stays 1)", async (t) => {
    record({ event_type: "search", event_key: "dedup" }, "5.5.5.5");
    record({ event_type: "search", event_key: "dedup" }, "5.5.5.5");
    const state = inspect();
    t.equal(state.bufferSize, 1);
    t.equal(state.dedupSize, 1);
    t.equal(firstEvent().count, 1, "second record was deduped");
  });

  await t.test(
    "different IPs for same event aggregates count in same bucket",
    async (t) => {
      record({ event_type: "search", event_key: "multi" }, "1.1.1.1");
      record({ event_type: "search", event_key: "multi" }, "2.2.2.2");
      const state = inspect();
      t.equal(state.bufferSize, 1, "same buffer key");
      t.equal(state.dedupSize, 2, "two dedup entries");
      t.equal(firstEvent().count, 2, "count incremented");
    },
  );

  await t.test("records view with proxy_id only", async (t) => {
    record({ event_type: "view", proxy_id: 42 }, "1.2.3.4");
    const state = inspect();
    t.equal(state.bufferSize, 1);
    const ev = firstEvent();
    t.equal(ev.event_type, "view");
    t.equal(ev.proxy_id, 42);
    t.equal(ev.endpoint_id, undefined);
  });

  await t.test("records view with proxy_id + endpoint_id", async (t) => {
    record({ event_type: "view", proxy_id: 1, endpoint_id: 10 }, "1.2.3.4");
    const ev = firstEvent();
    t.equal(ev.proxy_id, 1);
    t.equal(ev.endpoint_id, 10);
  });

  await t.test(
    "different event types from same IP are both recorded",
    async (t) => {
      record({ event_type: "search", event_key: "test" }, "3.3.3.3");
      record({ event_type: "view", proxy_id: 1 }, "3.3.3.3");
      const state = inspect();
      t.equal(state.bufferSize, 2);
      t.equal(state.dedupSize, 2);
    },
  );

  await t.test(
    "view without endpoint_id and view with endpoint_id are separate buffer entries",
    async (t) => {
      record({ event_type: "view", proxy_id: 1 }, "1.1.1.1");
      record({ event_type: "view", proxy_id: 1, endpoint_id: 5 }, "2.2.2.2");
      const state = inspect();
      t.equal(state.bufferSize, 2, "different buffer keys");
    },
  );
});

await t.test("flush", async (t) => {
  t.beforeEach(() => {
    _testReset();
  });

  await t.test(
    "clears buffer but preserves recent dedup entries",
    async (t) => {
      record({ event_type: "search", event_key: "flush-test" }, "1.2.3.4");
      t.equal(inspect().bufferSize, 1);
      await flush();
      const state = inspect();
      t.equal(state.bufferSize, 0, "buffer cleared");
      t.equal(
        state.dedupSize,
        1,
        "recent dedup entry preserved (within 5-min TTL)",
      );
    },
  );

  await t.test("empty buffer flush is a no-op", async (t) => {
    await flush();
    t.equal(inspect().bufferSize, 0);
  });

  await t.test(
    "after flush, same event+IP is still deduped (within TTL)",
    async (t) => {
      record({ event_type: "search", event_key: "retry" }, "9.9.9.9");
      await flush();
      record({ event_type: "search", event_key: "retry" }, "9.9.9.9");
      const state = inspect();
      t.equal(state.bufferSize, 0, "dedup prevents re-recording within TTL");
    },
  );

  await t.test(
    "after _testReset, same event+IP can be re-recorded",
    async (t) => {
      record({ event_type: "search", event_key: "reset" }, "8.8.8.8");
      _testReset();
      record({ event_type: "search", event_key: "reset" }, "8.8.8.8");
      const state = inspect();
      t.equal(state.bufferSize, 1, "re-recorded after full reset");
    },
  );
});

await t.test("startFlushTimer / stopFlushTimer", async (t) => {
  await t.test("start is idempotent, stop cleans up", async (t) => {
    startFlushTimer();
    startFlushTimer();
    stopFlushTimer();
    t.pass("safe to call start twice and stop once");
  });

  await t.test("stop without start is a no-op", async (t) => {
    stopFlushTimer();
    t.pass("no error");
  });

  t.teardown(() => {
    stopFlushTimer();
  });
});
