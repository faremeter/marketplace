import "../tests/setup/env.js";
import t from "tap";
import {
  parseCursorPagination,
  buildCursorResponse,
  DEFAULT_LIMIT,
  MAX_LIMIT,
} from "./pagination.js";

await t.test("parseCursorPagination", async (t) => {
  await t.test("returns default limit when no params provided", async (t) => {
    const result = parseCursorPagination(undefined, undefined);
    t.equal(result.cursor, null);
    t.equal(result.limit, DEFAULT_LIMIT);
  });

  await t.test("parses valid cursor", async (t) => {
    const result = parseCursorPagination("42", undefined);
    t.equal(result.cursor, 42);
    t.equal(result.limit, DEFAULT_LIMIT);
  });

  await t.test("parses valid limit", async (t) => {
    const result = parseCursorPagination(undefined, "50");
    t.equal(result.cursor, null);
    t.equal(result.limit, 50);
  });

  await t.test("parses both cursor and limit", async (t) => {
    const result = parseCursorPagination("10", "25");
    t.equal(result.cursor, 10);
    t.equal(result.limit, 25);
  });

  await t.test("returns null cursor for invalid cursor string", async (t) => {
    const result = parseCursorPagination("invalid", undefined);
    t.equal(result.cursor, null);
  });

  await t.test("uses default limit for invalid limit string", async (t) => {
    const result = parseCursorPagination(undefined, "invalid");
    t.equal(result.limit, DEFAULT_LIMIT);
  });

  await t.test("uses default limit for negative limit", async (t) => {
    const result = parseCursorPagination(undefined, "-5");
    t.equal(result.limit, DEFAULT_LIMIT);
  });

  await t.test("uses default limit for zero limit", async (t) => {
    const result = parseCursorPagination(undefined, "0");
    t.equal(result.limit, DEFAULT_LIMIT);
  });

  await t.test("caps limit at MAX_LIMIT", async (t) => {
    const result = parseCursorPagination(undefined, "500");
    t.equal(result.limit, MAX_LIMIT);
  });

  await t.test("accepts custom default limit", async (t) => {
    const result = parseCursorPagination(undefined, undefined, 10);
    t.equal(result.limit, 10);
  });
});

await t.test("buildCursorResponse", async (t) => {
  await t.test(
    "returns hasMore: false when results less than limit",
    async (t) => {
      const results = [{ id: 1 }, { id: 2 }];
      const response = buildCursorResponse(results, 5);
      t.equal(response.pagination.hasMore, false);
      t.equal(response.pagination.nextCursor, null);
      t.equal(response.data.length, 2);
    },
  );

  await t.test(
    "returns hasMore: false when results equal to limit",
    async (t) => {
      const results = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const response = buildCursorResponse(results, 3);
      t.equal(response.pagination.hasMore, false);
      t.equal(response.pagination.nextCursor, null);
      t.equal(response.data.length, 3);
    },
  );

  await t.test("returns hasMore: true when results exceed limit", async (t) => {
    const results = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
    const response = buildCursorResponse(results, 3);
    t.equal(response.pagination.hasMore, true);
    t.equal(response.pagination.nextCursor, "3");
    t.equal(response.data.length, 3);
  });

  await t.test("returns correct nextCursor from last item", async (t) => {
    const results = [{ id: 10 }, { id: 20 }, { id: 30 }, { id: 40 }];
    const response = buildCursorResponse(results, 3);
    t.equal(response.pagination.nextCursor, "30");
  });

  await t.test("handles empty results", async (t) => {
    const results: { id: number }[] = [];
    const response = buildCursorResponse(results, 10);
    t.equal(response.pagination.hasMore, false);
    t.equal(response.pagination.nextCursor, null);
    t.equal(response.data.length, 0);
  });
});
