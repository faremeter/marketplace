import t from "tap";
import { sanitizeProxyName, validateProxyName } from "./proxy-name.js";

await t.test("sanitizeProxyName", async (t) => {
  await t.test("converts to lowercase", async (t) => {
    t.equal(sanitizeProxyName("MyAPI"), "myapi");
    t.equal(sanitizeProxyName("TEST"), "test");
  });

  await t.test("replaces non-alphanumeric with dashes", async (t) => {
    t.equal(sanitizeProxyName("My API"), "my-api");
    t.equal(sanitizeProxyName("test_api_v2"), "test-api-v2");
    t.equal(sanitizeProxyName("test!!api##123"), "test-api-123");
  });

  await t.test("collapses multiple special chars to single dash", async (t) => {
    t.equal(sanitizeProxyName("test___api"), "test-api");
    t.equal(sanitizeProxyName("test   api"), "test-api");
    t.equal(sanitizeProxyName("test!@#api"), "test-api");
  });

  await t.test("trims leading/trailing dashes", async (t) => {
    t.equal(sanitizeProxyName("---test---"), "test");
    t.equal(sanitizeProxyName("-api-"), "api");
  });

  await t.test("trims whitespace", async (t) => {
    t.equal(sanitizeProxyName("  test  "), "test");
    t.equal(sanitizeProxyName("\tapi\n"), "api");
  });

  await t.test("enforces 63 character limit", async (t) => {
    const longName = "a".repeat(100);
    t.equal(sanitizeProxyName(longName).length, 63);
    t.equal(sanitizeProxyName(longName), "a".repeat(63));
  });

  await t.test("handles already valid names", async (t) => {
    t.equal(sanitizeProxyName("valid-name"), "valid-name");
    t.equal(sanitizeProxyName("api123"), "api123");
  });
});

await t.test("validateProxyName", async (t) => {
  await t.test("returns valid for good names", async (t) => {
    t.same(validateProxyName("valid-name"), {
      valid: true,
      sanitized: "valid-name",
    });
    t.same(validateProxyName("api123"), { valid: true, sanitized: "api123" });
    t.same(validateProxyName("a"), { valid: true, sanitized: "a" });
  });

  await t.test("sanitizes and validates input", async (t) => {
    const result = validateProxyName("My API");
    t.equal(result.valid, true);
    t.equal(result.sanitized, "my-api");
  });

  await t.test("rejects empty string", async (t) => {
    const result = validateProxyName("");
    t.equal(result.valid, false);
    t.equal(result.sanitized, "");
    t.equal(result.error, "Proxy name is required");
  });

  await t.test("rejects whitespace-only", async (t) => {
    const result = validateProxyName("   ");
    t.equal(result.valid, false);
    t.equal(result.sanitized, "");
    t.equal(result.error, "Proxy name is required");
  });

  await t.test("rejects names with only special chars", async (t) => {
    const result = validateProxyName("###");
    t.equal(result.valid, false);
    t.equal(result.sanitized, "");
    t.equal(
      result.error,
      "Proxy name must contain at least one letter or number",
    );
  });

  await t.test("handles names with leading/trailing whitespace", async (t) => {
    const result = validateProxyName("  valid-name  ");
    t.equal(result.valid, true);
    t.equal(result.sanitized, "valid-name");
  });
});
