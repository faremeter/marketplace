import "../tests/setup/env.js";
import t from "tap";
import { isBot, isValidSearch, hasResults } from "./filters.js";

await t.test("isBot", async (t) => {
  await t.test("returns false for undefined user-agent", async (t) => {
    t.equal(isBot(undefined), false);
  });

  await t.test("returns false for empty string", async (t) => {
    t.equal(isBot(""), false);
  });

  await t.test("returns false for normal browser UA", async (t) => {
    t.equal(
      isBot(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      ),
      false,
    );
  });

  const bots = [
    "Googlebot/2.1",
    "bingbot/2.0",
    "Slurp",
    "DuckDuckBot/1.0",
    "Baiduspider/2.0",
    "YandexBot/3.0",
    "facebookexternalhit/1.1",
    "Twitterbot/1.0",
    "LinkedInBot/1.0",
    "Applebot/0.1",
    "SemrushBot/7",
    "AhrefsBot/7.0",
    "MJ12bot/v1.4",
    "DotBot/1.2",
    "PetalBot",
    "Bytespider",
    "GPTBot/1.0",
  ];

  for (const ua of bots) {
    await t.test(`detects ${ua}`, async (t) => {
      t.equal(isBot(ua), true);
    });
  }

  await t.test("detects bot embedded in longer UA string", async (t) => {
    t.equal(
      isBot(
        "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      ),
      true,
    );
  });

  await t.test("detection is case-insensitive", async (t) => {
    t.equal(isBot("GOOGLEBOT"), true);
    t.equal(isBot("googlebot"), true);
  });
});

await t.test("isValidSearch", async (t) => {
  await t.test("returns true for 3+ alphanumeric chars", async (t) => {
    t.equal(isValidSearch("abc"), true);
  });

  await t.test("returns false for 2 chars", async (t) => {
    t.equal(isValidSearch("ab"), false);
  });

  await t.test("returns false for 1 char", async (t) => {
    t.equal(isValidSearch("a"), false);
  });

  await t.test("returns false for empty string", async (t) => {
    t.equal(isValidSearch(""), false);
  });

  await t.test("returns false for whitespace-only", async (t) => {
    t.equal(isValidSearch("   "), false);
  });

  await t.test("returns false for special-char-only input", async (t) => {
    t.equal(isValidSearch("!@#$%"), false);
  });

  await t.test("strips special chars before counting", async (t) => {
    t.equal(isValidSearch("a!b@c"), true);
    t.equal(isValidSearch("a!b"), false);
  });

  await t.test("counts underscores as valid chars", async (t) => {
    t.equal(isValidSearch("a_b"), true);
  });

  await t.test("counts digits as valid chars", async (t) => {
    t.equal(isValidSearch("123"), true);
  });

  await t.test("returns true at exactly 3 valid chars boundary", async (t) => {
    t.equal(isValidSearch("abc"), true);
    t.equal(isValidSearch("ab"), false);
  });
});

await t.test("hasResults", async (t) => {
  await t.test("returns false when both counts are zero", async (t) => {
    t.equal(hasResults(0, 0), false);
  });

  await t.test("returns true when only proxies > 0", async (t) => {
    t.equal(hasResults(1, 0), true);
  });

  await t.test("returns true when only endpoints > 0", async (t) => {
    t.equal(hasResults(0, 1), true);
  });

  await t.test("returns true when both > 0", async (t) => {
    t.equal(hasResults(5, 3), true);
  });
});
