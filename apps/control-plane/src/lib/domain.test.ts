import t from "tap";
import {
  buildTenantDomain,
  buildSetIdentifier,
  getBaseDomain,
  toDomainInfo,
} from "./domain.js";

await t.test("buildTenantDomain", async (t) => {
  await t.test(
    "builds legacy domain correctly (orgSlug is null)",
    async (t) => {
      const result = buildTenantDomain({
        proxyName: "weather",
        orgSlug: null,
      });
      t.equal(result, "weather.api.corbits.dev");
    },
  );

  await t.test("builds org_slug domain correctly", async (t) => {
    const result = buildTenantDomain({
      proxyName: "weather",
      orgSlug: "acme",
    });
    t.equal(result, "weather.acme.api.corbits.dev");
  });

  await t.test("handles proxy name with hyphens", async (t) => {
    const result = buildTenantDomain({
      proxyName: "my-api-service",
      orgSlug: "acme-corp",
    });
    t.equal(result, "my-api-service.acme-corp.api.corbits.dev");
  });
});

await t.test("buildSetIdentifier", async (t) => {
  await t.test("builds legacy set identifier correctly", async (t) => {
    const result = buildSetIdentifier(
      { proxyName: "weather", orgSlug: null },
      1,
    );
    t.equal(result, "weather-node-1");
  });

  await t.test("builds org_slug set identifier correctly", async (t) => {
    const result = buildSetIdentifier(
      { proxyName: "weather", orgSlug: "acme" },
      1,
    );
    t.equal(result, "weather-acme-node-1");
  });

  await t.test("handles different node IDs", async (t) => {
    const result1 = buildSetIdentifier(
      { proxyName: "api", orgSlug: "acme" },
      5,
    );
    t.equal(result1, "api-acme-node-5");

    const result2 = buildSetIdentifier({ proxyName: "api", orgSlug: null }, 99);
    t.equal(result2, "api-node-99");
  });
});

await t.test("getBaseDomain", async (t) => {
  await t.test("returns correct base domain", async (t) => {
    const result = getBaseDomain();
    t.equal(result, "api.corbits.dev");
  });
});

await t.test("toDomainInfo", async (t) => {
  await t.test("converts tenant with org_slug", async (t) => {
    const result = toDomainInfo({
      name: "weather",
      org_slug: "acme",
    });
    t.same(result, {
      proxyName: "weather",
      orgSlug: "acme",
    });
  });

  await t.test("converts tenant without org_slug (legacy)", async (t) => {
    const result = toDomainInfo({
      name: "weather",
      org_slug: null,
    });
    t.same(result, {
      proxyName: "weather",
      orgSlug: null,
    });
  });

  await t.test("defaults org_slug to null when undefined", async (t) => {
    const result = toDomainInfo({
      name: "weather",
    });
    t.equal(result.orgSlug, null);
  });

  await t.test("preserves proxy name exactly", async (t) => {
    const result = toDomainInfo({
      name: "My-Api-123",
      org_slug: null,
    });
    t.equal(result.proxyName, "My-Api-123");
  });
});
