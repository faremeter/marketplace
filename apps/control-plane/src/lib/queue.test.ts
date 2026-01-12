import "../tests/setup/env.js";
import t from "tap";
import { db, setupTestSchema, clearTestData } from "../db/instance.js";
import { enqueueBalanceCheck, checkAndUpdateTenantStatus } from "./queue.js";

await setupTestSchema();

async function createOrg(name: string, slug: string) {
  return db
    .insertInto("organizations")
    .values({ name, slug })
    .returning(["id", "name", "slug"])
    .executeTakeFirstOrThrow();
}

function evmOnlyConfig() {
  return {
    evm: {
      base: {
        address: "0x1234567890123456789012345678901234567890",
      },
    },
  };
}

function solanaOnlyConfig() {
  return {
    solana: {
      "mainnet-beta": {
        address: "So11111111111111111111111111111111111111112",
      },
    },
  };
}

t.beforeEach(async () => {
  await clearTestData();
});

await t.test("enqueueBalanceCheck", async (t) => {
  await t.test("EVM-only wallet: immediately marks as funded", async (t) => {
    const org = await createOrg("Test Org", "test-org");

    const wallet = await db
      .insertInto("wallets")
      .values({
        name: "EVM Wallet",
        organization_id: org.id,
        wallet_config: JSON.stringify(evmOnlyConfig()),
        funding_status: "pending",
      })
      .returning(["id", "funding_status"])
      .executeTakeFirstOrThrow();

    t.equal(wallet.funding_status, "pending");

    // Call enqueueBalanceCheck with null solanaAddress (EVM-only)
    await enqueueBalanceCheck(wallet.id, null);

    // Verify wallet is now marked as funded
    const updatedWallet = await db
      .selectFrom("wallets")
      .select(["id", "funding_status"])
      .where("id", "=", wallet.id)
      .executeTakeFirstOrThrow();

    t.equal(updatedWallet.funding_status, "funded");
  });

  await t.test(
    "EVM-only wallet: updates tenant status to active",
    async (t) => {
      const org = await createOrg("Test Org", "test-org");

      const wallet = await db
        .insertInto("wallets")
        .values({
          name: "EVM Wallet",
          organization_id: org.id,
          wallet_config: JSON.stringify(evmOnlyConfig()),
          funding_status: "pending",
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      // Create tenant with the wallet
      const tenant = await db
        .insertInto("tenants")
        .values({
          name: "test-proxy",
          backend_url: "http://backend.com",
          organization_id: org.id,
          wallet_id: wallet.id,
          default_price_usdc: 0.01,
          default_scheme: "exact",
          status: "pending",
        })
        .returning(["id", "status"])
        .executeTakeFirstOrThrow();

      t.equal(tenant.status, "pending");

      // Call enqueueBalanceCheck with null solanaAddress (EVM-only)
      await enqueueBalanceCheck(wallet.id, null);

      // Verify wallet is funded
      const updatedWallet = await db
        .selectFrom("wallets")
        .select("funding_status")
        .where("id", "=", wallet.id)
        .executeTakeFirstOrThrow();
      t.equal(updatedWallet.funding_status, "funded");

      // Tenant should still be pending (certs not provisioned)
      // but wallet status check passed
      const updatedTenant = await db
        .selectFrom("tenants")
        .select("status")
        .where("id", "=", tenant.id)
        .executeTakeFirstOrThrow();

      // Tenant becomes active only if both wallet is funded AND certs are provisioned
      // Since no certs exist (tenant_nodes is empty), it treats as "all provisioned"
      // So tenant should become active
      t.equal(updatedTenant.status, "active");
    },
  );

  await t.test(
    "Solana wallet: returns early in test environment",
    async (t) => {
      const org = await createOrg("Test Org", "test-org");

      const wallet = await db
        .insertInto("wallets")
        .values({
          name: "Solana Wallet",
          organization_id: org.id,
          wallet_config: JSON.stringify(solanaOnlyConfig()),
          funding_status: "pending",
        })
        .returning(["id", "funding_status"])
        .executeTakeFirstOrThrow();

      // Call enqueueBalanceCheck with a Solana address
      // In test environment, this should return early without doing anything
      await enqueueBalanceCheck(
        wallet.id,
        "So11111111111111111111111111111111111111112",
      );

      // Wallet should still be pending (no change in test env)
      const updatedWallet = await db
        .selectFrom("wallets")
        .select("funding_status")
        .where("id", "=", wallet.id)
        .executeTakeFirstOrThrow();

      t.equal(updatedWallet.funding_status, "pending");
    },
  );

  await t.test("handles multiple tenants sharing same wallet", async (t) => {
    const org = await createOrg("Test Org", "test-org");

    const wallet = await db
      .insertInto("wallets")
      .values({
        name: "Shared Wallet",
        organization_id: org.id,
        wallet_config: JSON.stringify(evmOnlyConfig()),
        funding_status: "pending",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    // Create multiple tenants with the same wallet
    const tenant1 = await db
      .insertInto("tenants")
      .values({
        name: "proxy-one",
        backend_url: "http://backend1.com",
        organization_id: org.id,
        wallet_id: wallet.id,
        default_price_usdc: 0.01,
        default_scheme: "exact",
        status: "pending",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const tenant2 = await db
      .insertInto("tenants")
      .values({
        name: "proxy-two",
        backend_url: "http://backend2.com",
        organization_id: org.id,
        wallet_id: wallet.id,
        default_price_usdc: 0.02,
        default_scheme: "exact",
        status: "pending",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    // Call enqueueBalanceCheck
    await enqueueBalanceCheck(wallet.id, null);

    // Both tenants should be updated
    const updatedTenant1 = await db
      .selectFrom("tenants")
      .select("status")
      .where("id", "=", tenant1.id)
      .executeTakeFirstOrThrow();
    const updatedTenant2 = await db
      .selectFrom("tenants")
      .select("status")
      .where("id", "=", tenant2.id)
      .executeTakeFirstOrThrow();

    t.equal(updatedTenant1.status, "active");
    t.equal(updatedTenant2.status, "active");
  });
});

await t.test("checkAndUpdateTenantStatus", async (t) => {
  await t.test(
    "updates to active when wallet funded and no certs needed",
    async (t) => {
      const org = await createOrg("Test Org", "test-org");

      const wallet = await db
        .insertInto("wallets")
        .values({
          name: "Funded Wallet",
          organization_id: org.id,
          wallet_config: JSON.stringify(evmOnlyConfig()),
          funding_status: "funded",
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      const tenant = await db
        .insertInto("tenants")
        .values({
          name: "test-proxy",
          backend_url: "http://backend.com",
          organization_id: org.id,
          wallet_id: wallet.id,
          default_price_usdc: 0.01,
          default_scheme: "exact",
          status: "pending",
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      await checkAndUpdateTenantStatus(tenant.id);

      const updatedTenant = await db
        .selectFrom("tenants")
        .select(["status", "is_active"])
        .where("id", "=", tenant.id)
        .executeTakeFirstOrThrow();

      t.equal(updatedTenant.status, "active");
      t.equal(updatedTenant.is_active, true);
    },
  );

  await t.test("stays pending when wallet not funded", async (t) => {
    const org = await createOrg("Test Org", "test-org");

    const wallet = await db
      .insertInto("wallets")
      .values({
        name: "Pending Wallet",
        organization_id: org.id,
        wallet_config: JSON.stringify(solanaOnlyConfig()),
        funding_status: "pending",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const tenant = await db
      .insertInto("tenants")
      .values({
        name: "test-proxy",
        backend_url: "http://backend.com",
        organization_id: org.id,
        wallet_id: wallet.id,
        default_price_usdc: 0.01,
        default_scheme: "exact",
        status: "pending",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    await checkAndUpdateTenantStatus(tenant.id);

    const updatedTenant = await db
      .selectFrom("tenants")
      .select("status")
      .where("id", "=", tenant.id)
      .executeTakeFirstOrThrow();

    t.equal(updatedTenant.status, "pending");
  });

  await t.test("updates to failed when wallet failed", async (t) => {
    const org = await createOrg("Test Org", "test-org");

    const wallet = await db
      .insertInto("wallets")
      .values({
        name: "Failed Wallet",
        organization_id: org.id,
        wallet_config: JSON.stringify(solanaOnlyConfig()),
        funding_status: "failed",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const tenant = await db
      .insertInto("tenants")
      .values({
        name: "test-proxy",
        backend_url: "http://backend.com",
        organization_id: org.id,
        wallet_id: wallet.id,
        default_price_usdc: 0.01,
        default_scheme: "exact",
        status: "pending",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    await checkAndUpdateTenantStatus(tenant.id);

    const updatedTenant = await db
      .selectFrom("tenants")
      .select("status")
      .where("id", "=", tenant.id)
      .executeTakeFirstOrThrow();

    t.equal(updatedTenant.status, "failed");
  });

  await t.test("does nothing for already active tenant", async (t) => {
    const org = await createOrg("Test Org", "test-org");

    const wallet = await db
      .insertInto("wallets")
      .values({
        name: "Funded Wallet",
        organization_id: org.id,
        wallet_config: JSON.stringify(evmOnlyConfig()),
        funding_status: "funded",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const tenant = await db
      .insertInto("tenants")
      .values({
        name: "test-proxy",
        backend_url: "http://backend.com",
        organization_id: org.id,
        wallet_id: wallet.id,
        default_price_usdc: 0.01,
        default_scheme: "exact",
        status: "active",
        is_active: true,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    // Should not throw or change anything
    await checkAndUpdateTenantStatus(tenant.id);

    const updatedTenant = await db
      .selectFrom("tenants")
      .select("status")
      .where("id", "=", tenant.id)
      .executeTakeFirstOrThrow();

    t.equal(updatedTenant.status, "active");
  });

  await t.test("does nothing for tenant without wallet", async (t) => {
    const org = await createOrg("Test Org", "test-org");

    const tenant = await db
      .insertInto("tenants")
      .values({
        name: "test-proxy",
        backend_url: "http://backend.com",
        organization_id: org.id,
        wallet_id: null,
        default_price_usdc: 0.01,
        default_scheme: "exact",
        status: "pending",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    // Should not throw
    await checkAndUpdateTenantStatus(tenant.id);

    const updatedTenant = await db
      .selectFrom("tenants")
      .select("status")
      .where("id", "=", tenant.id)
      .executeTakeFirstOrThrow();

    t.equal(updatedTenant.status, "pending");
  });

  await t.test("waits for cert provisioning before activating", async (t) => {
    const org = await createOrg("Test Org", "test-org");

    const wallet = await db
      .insertInto("wallets")
      .values({
        name: "Funded Wallet",
        organization_id: org.id,
        wallet_config: JSON.stringify(evmOnlyConfig()),
        funding_status: "funded",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const tenant = await db
      .insertInto("tenants")
      .values({
        name: "test-proxy",
        backend_url: "http://backend.com",
        organization_id: org.id,
        wallet_id: wallet.id,
        default_price_usdc: 0.01,
        default_scheme: "exact",
        status: "pending",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    // Create a node for the tenant
    const node = await db
      .insertInto("nodes")
      .values({
        name: "test-node",
        internal_ip: "10.0.0.1",
        public_ip: "1.2.3.4",
        status: "active",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    // Create tenant_node with pending cert
    await db
      .insertInto("tenant_nodes")
      .values({
        tenant_id: tenant.id,
        node_id: node.id,
        cert_status: "pending",
      })
      .execute();

    await checkAndUpdateTenantStatus(tenant.id);

    // Should stay pending because cert is not provisioned
    const updatedTenant = await db
      .selectFrom("tenants")
      .select("status")
      .where("id", "=", tenant.id)
      .executeTakeFirstOrThrow();

    t.equal(updatedTenant.status, "pending");

    // Now mark cert as provisioned
    await db
      .updateTable("tenant_nodes")
      .set({ cert_status: "provisioned" })
      .where("tenant_id", "=", tenant.id)
      .execute();

    await checkAndUpdateTenantStatus(tenant.id);

    // Now should be active
    const finalTenant = await db
      .selectFrom("tenants")
      .select("status")
      .where("id", "=", tenant.id)
      .executeTakeFirstOrThrow();

    t.equal(finalTenant.status, "active");
  });
});
