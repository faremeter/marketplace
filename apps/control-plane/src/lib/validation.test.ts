import t from "tap";
import {
  normalizeEmail,
  isExpired,
  parsePagination,
  MAX_PAGINATION_LIMIT,
} from "./validation.js";

await t.test("normalizeEmail", async (t) => {
  await t.test("converts email to lowercase", async (t) => {
    t.equal(normalizeEmail("Test@EXAMPLE.com"), "test@example.com");
    t.equal(normalizeEmail("UPPER@CASE.COM"), "upper@case.com");
  });

  await t.test("trims whitespace", async (t) => {
    t.equal(normalizeEmail("  user@domain.com  "), "user@domain.com");
    t.equal(normalizeEmail("\ttest@example.com\n"), "test@example.com");
  });

  await t.test("handles already normalized emails", async (t) => {
    t.equal(normalizeEmail("test@example.com"), "test@example.com");
  });
});

await t.test("isExpired", async (t) => {
  await t.test("returns false for null/undefined", async (t) => {
    t.equal(isExpired(null), false);
    t.equal(isExpired(undefined), false);
  });

  await t.test("returns true for past dates", async (t) => {
    const pastDate = new Date(Date.now() - 1000);
    t.equal(isExpired(pastDate), true);

    const distantPast = new Date("2000-01-01");
    t.equal(isExpired(distantPast), true);
  });

  await t.test("returns false for future dates", async (t) => {
    const futureDate = new Date(Date.now() + 100000);
    t.equal(isExpired(futureDate), false);
  });

  await t.test("handles ISO string dates", async (t) => {
    const pastIso = new Date(Date.now() - 1000).toISOString();
    t.equal(isExpired(pastIso), true);

    const futureIso = new Date(Date.now() + 100000).toISOString();
    t.equal(isExpired(futureIso), false);
  });
});

await t.test("parsePagination", async (t) => {
  await t.test("uses defaults when no values provided", async (t) => {
    t.same(parsePagination(undefined, undefined), { limit: 50, offset: 0 });
  });

  await t.test("uses custom default limit", async (t) => {
    t.same(parsePagination(undefined, undefined, 100), {
      limit: 100,
      offset: 0,
    });
  });

  await t.test("parses valid limit and offset", async (t) => {
    t.same(parsePagination("25", "10"), { limit: 25, offset: 10 });
    t.same(parsePagination("100", "50"), { limit: 100, offset: 50 });
  });

  await t.test("caps limit at MAX_PAGINATION_LIMIT", async (t) => {
    t.same(parsePagination("2000", "0"), {
      limit: MAX_PAGINATION_LIMIT,
      offset: 0,
    });
    t.same(parsePagination("9999", "0"), {
      limit: MAX_PAGINATION_LIMIT,
      offset: 0,
    });
  });

  await t.test("treats negative offset as 0", async (t) => {
    t.same(parsePagination("50", "-10"), { limit: 50, offset: 0 });
  });

  await t.test("handles invalid/non-numeric strings", async (t) => {
    t.same(parsePagination("abc", "xyz"), { limit: 50, offset: 0 });
    t.same(parsePagination("", ""), { limit: 50, offset: 0 });
  });

  await t.test("handles mixed valid/invalid", async (t) => {
    t.same(parsePagination("25", "abc"), { limit: 25, offset: 0 });
    t.same(parsePagination("abc", "10"), { limit: 50, offset: 10 });
  });
});
