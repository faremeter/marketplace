import "../tests/setup/env.js";
import t from "tap";
import { normalizeQuery } from "./normalize.js";

await t.test("normalizeQuery", async (t) => {
  await t.test("lowercases input", async (t) => {
    t.equal(normalizeQuery("Hello"), "hello");
  });

  await t.test("sorts words alphabetically", async (t) => {
    t.equal(normalizeQuery("hello api world"), "api hello world");
  });

  await t.test("trims leading and trailing whitespace", async (t) => {
    t.equal(normalizeQuery("  hello  "), "hello");
  });

  await t.test("collapses multiple spaces", async (t) => {
    t.equal(normalizeQuery("hello    world"), "hello world");
  });

  await t.test("handles single word", async (t) => {
    t.equal(normalizeQuery("solana"), "solana");
  });

  await t.test("returns empty string for empty input", async (t) => {
    t.equal(normalizeQuery(""), "");
  });

  await t.test("returns empty string for whitespace-only input", async (t) => {
    t.equal(normalizeQuery("   "), "");
  });

  await t.test("lowercases and sorts mixed case words", async (t) => {
    t.equal(normalizeQuery("Zebra Apple banana"), "apple banana zebra");
  });

  await t.test("handles tabs and newlines as whitespace", async (t) => {
    t.equal(normalizeQuery("foo\tbar\nbaz"), "bar baz foo");
  });

  await t.test("sorts numbers before letters", async (t) => {
    t.equal(normalizeQuery("api 123 test"), "123 api test");
  });

  await t.test("preserves hyphens within tokens", async (t) => {
    t.equal(normalizeQuery("hello-world api"), "api hello-world");
  });
});
