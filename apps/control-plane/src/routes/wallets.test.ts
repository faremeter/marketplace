import "../tests/setup/env.js";
import t from "tap";
import { Hono } from "hono";
import { db, setupTestSchema, clearTestData } from "../db/instance.js";
import { signToken } from "../middleware/auth.js";
import { walletsRoutes } from "./wallets.js";

const app = new Hono();
app.route("/api/wallets", walletsRoutes);

await setupTestSchema();

async function createUser(email: string, isAdmin = false) {
  const user = await db
    .insertInto("users")
    .values({
      email,
      password_hash: "hash",
      is_admin: isAdmin,
    })
    .returning(["id", "email"])
    .executeTakeFirstOrThrow();

  return {
    ...user,
    token: signToken({ userId: user.id, email: user.email, isAdmin }),
  };
}

async function createOrg(name: string, slug: string) {
  return db
    .insertInto("organizations")
    .values({ name, slug })
    .returning(["id", "name", "slug"])
    .executeTakeFirstOrThrow();
}

async function addMember(userId: number, orgId: number, role: string) {
  await db
    .insertInto("user_organizations")
    .values({
      user_id: userId,
      organization_id: orgId,
      role,
    })
    .execute();
}

function validWalletConfig() {
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

await t.test("GET /api/wallets/organization/:orgId", async (t) => {
  await t.test("returns 401 without auth", async (t) => {
    const res = await app.request("/api/wallets/organization/1");
    t.equal(res.status, 401);
  });

  await t.test("returns 404 for non-member", async (t) => {
    const user = await createUser("outsider@example.com");
    const org = await createOrg("Team", "team");

    const res = await app.request(`/api/wallets/organization/${org.id}`, {
      headers: { Cookie: `auth_token=${user.token}` },
    });

    t.equal(res.status, 404);
  });

  await t.test("returns empty list when no wallets", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id, "member");

    const res = await app.request(`/api/wallets/organization/${org.id}`, {
      headers: { Cookie: `auth_token=${user.token}` },
    });

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.same(data, []);
  });

  await t.test("returns wallets for member", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id, "member");

    await db
      .insertInto("wallets")
      .values({
        name: "Test Wallet",
        organization_id: org.id,
        wallet_config: JSON.stringify(validWalletConfig()),
      })
      .execute();

    const res = await app.request(`/api/wallets/organization/${org.id}`, {
      headers: { Cookie: `auth_token=${user.token}` },
    });

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.length, 1);
    t.equal(data[0].name, "Test Wallet");
  });

  await t.test("admin can view any org wallets", async (t) => {
    const admin = await createUser("admin@example.com", true);
    const org = await createOrg("Team", "team");

    await db
      .insertInto("wallets")
      .values({
        name: "Admin Viewable",
        organization_id: org.id,
        wallet_config: JSON.stringify(validWalletConfig()),
      })
      .execute();

    const res = await app.request(`/api/wallets/organization/${org.id}`, {
      headers: { Cookie: `auth_token=${admin.token}` },
    });

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.length, 1);
  });

  await t.test("returns wallets sorted by name", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id, "member");

    await db
      .insertInto("wallets")
      .values({
        name: "Zebra Wallet",
        organization_id: org.id,
        wallet_config: JSON.stringify(validWalletConfig()),
      })
      .execute();

    await db
      .insertInto("wallets")
      .values({
        name: "Alpha Wallet",
        organization_id: org.id,
        wallet_config: JSON.stringify(validWalletConfig()),
      })
      .execute();

    const res = await app.request(`/api/wallets/organization/${org.id}`, {
      headers: { Cookie: `auth_token=${user.token}` },
    });

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data[0].name, "Alpha Wallet");
    t.equal(data[1].name, "Zebra Wallet");
  });
});

await t.test("GET /api/wallets/organization/:orgId/check-name", async (t) => {
  await t.test("returns 404 for non-member", async (t) => {
    const user = await createUser("outsider@example.com");
    const org = await createOrg("Team", "team");

    const res = await app.request(
      `/api/wallets/organization/${org.id}/check-name?name=test`,
      {
        headers: { Cookie: `auth_token=${user.token}` },
      },
    );

    t.equal(res.status, 404);
  });

  await t.test("returns false for empty name", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id, "member");

    const res = await app.request(
      `/api/wallets/organization/${org.id}/check-name?name=`,
      {
        headers: { Cookie: `auth_token=${user.token}` },
      },
    );

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.available, false);
  });

  await t.test("returns true for available name", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id, "member");

    const res = await app.request(
      `/api/wallets/organization/${org.id}/check-name?name=NewWallet`,
      {
        headers: { Cookie: `auth_token=${user.token}` },
      },
    );

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.available, true);
  });

  await t.test("returns false for taken name", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id, "member");

    await db
      .insertInto("wallets")
      .values({
        name: "Existing",
        organization_id: org.id,
        wallet_config: JSON.stringify(validWalletConfig()),
      })
      .execute();

    const res = await app.request(
      `/api/wallets/organization/${org.id}/check-name?name=Existing`,
      {
        headers: { Cookie: `auth_token=${user.token}` },
      },
    );

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.available, false);
  });

  await t.test("excludeId allows checking own name for update", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id, "member");

    const wallet = await db
      .insertInto("wallets")
      .values({
        name: "MyWallet",
        organization_id: org.id,
        wallet_config: JSON.stringify(validWalletConfig()),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const res = await app.request(
      `/api/wallets/organization/${org.id}/check-name?name=MyWallet&excludeId=${wallet.id}`,
      { headers: { Cookie: `auth_token=${user.token}` } },
    );

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.available, true);
  });
});

await t.test("GET /api/wallets/:id", async (t) => {
  await t.test("returns 404 for non-existent wallet", async (t) => {
    const user = await createUser("member@example.com");

    const res = await app.request("/api/wallets/9999", {
      headers: { Cookie: `auth_token=${user.token}` },
    });

    t.equal(res.status, 404);
  });

  await t.test("returns 404 for non-member", async (t) => {
    const user = await createUser("outsider@example.com");
    const org = await createOrg("Team", "team");

    const wallet = await db
      .insertInto("wallets")
      .values({
        name: "Private Wallet",
        organization_id: org.id,
        wallet_config: JSON.stringify(validWalletConfig()),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const res = await app.request(`/api/wallets/${wallet.id}`, {
      headers: { Cookie: `auth_token=${user.token}` },
    });

    t.equal(res.status, 404);
  });

  await t.test("returns 404 for master wallet when not admin", async (t) => {
    const user = await createUser("member@example.com");

    const wallet = await db
      .insertInto("wallets")
      .values({
        name: "Master Wallet",
        organization_id: null,
        wallet_config: JSON.stringify(validWalletConfig()),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const res = await app.request(`/api/wallets/${wallet.id}`, {
      headers: { Cookie: `auth_token=${user.token}` },
    });

    t.equal(res.status, 404);
  });

  await t.test("returns wallet for member", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id, "member");

    const wallet = await db
      .insertInto("wallets")
      .values({
        name: "Team Wallet",
        organization_id: org.id,
        wallet_config: JSON.stringify(validWalletConfig()),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const res = await app.request(`/api/wallets/${wallet.id}`, {
      headers: { Cookie: `auth_token=${user.token}` },
    });

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.name, "Team Wallet");
  });

  await t.test("admin can view any wallet", async (t) => {
    const admin = await createUser("admin@example.com", true);
    const org = await createOrg("Team", "team");

    const wallet = await db
      .insertInto("wallets")
      .values({
        name: "Any Wallet",
        organization_id: org.id,
        wallet_config: JSON.stringify(validWalletConfig()),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const res = await app.request(`/api/wallets/${wallet.id}`, {
      headers: { Cookie: `auth_token=${admin.token}` },
    });

    t.equal(res.status, 200);
  });

  await t.test("admin can view master wallet", async (t) => {
    const admin = await createUser("admin@example.com", true);

    const wallet = await db
      .insertInto("wallets")
      .values({
        name: "Master Wallet",
        organization_id: null,
        wallet_config: JSON.stringify(validWalletConfig()),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const res = await app.request(`/api/wallets/${wallet.id}`, {
      headers: { Cookie: `auth_token=${admin.token}` },
    });

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.name, "Master Wallet");
  });
});

await t.test("GET /api/wallets/:id/balances", async (t) => {
  await t.test("returns 404 for non-existent wallet", async (t) => {
    const user = await createUser("member@example.com");

    const res = await app.request("/api/wallets/9999/balances", {
      headers: { Cookie: `auth_token=${user.token}` },
    });

    t.equal(res.status, 404);
  });

  await t.test("returns 404 for non-member", async (t) => {
    const user = await createUser("outsider@example.com");
    const org = await createOrg("Team", "team");

    const wallet = await db
      .insertInto("wallets")
      .values({
        name: "Private Wallet",
        organization_id: org.id,
        wallet_config: JSON.stringify(validWalletConfig()),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const res = await app.request(`/api/wallets/${wallet.id}/balances`, {
      headers: { Cookie: `auth_token=${user.token}` },
    });

    t.equal(res.status, 404);
  });

  await t.test("returns 404 for master wallet when not admin", async (t) => {
    const user = await createUser("member@example.com");

    const wallet = await db
      .insertInto("wallets")
      .values({
        name: "Master Wallet",
        organization_id: null,
        wallet_config: JSON.stringify(validWalletConfig()),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const res = await app.request(`/api/wallets/${wallet.id}/balances`, {
      headers: { Cookie: `auth_token=${user.token}` },
    });

    t.equal(res.status, 404);
  });

  await t.test("returns cached balances when fresh", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id, "member");

    const cachedBalances = {
      solana: { native: "1.5", usdc: "100.00" },
      base: { native: "0", usdc: "0" },
      polygon: { native: "0", usdc: "0" },
      monad: { native: "0", usdc: "0" },
    };

    const wallet = await db
      .insertInto("wallets")
      .values({
        name: "Cached Wallet",
        organization_id: org.id,
        wallet_config: JSON.stringify(validWalletConfig()),
        cached_balances: JSON.stringify(cachedBalances),
        balances_cached_at: new Date().toISOString(),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const res = await app.request(`/api/wallets/${wallet.id}/balances`, {
      headers: { Cookie: `auth_token=${user.token}` },
    });

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    const balances = typeof data === "string" ? JSON.parse(data) : data;
    t.equal(balances.solana.native, "1.5");
  });

  await t.test(
    "updates funding_status to funded when balance meets minimum",
    async (t) => {
      const mockBalances = {
        solana: { native: "1.0", usdc: "10.0" },
        base: { native: "0", usdc: "0" },
        polygon: { native: "0", usdc: "0" },
        monad: { native: "0", usdc: "0" },
      };

      const { walletsRoutes: mockedRoutes } = await t.mockImport<
        typeof import("./wallets.js")
      >("./wallets.js", {
        "../lib/balances.js": {
          ...(await import("../lib/balances.js")),
          fetchWalletBalances: async () => mockBalances,
        },
      });

      const testApp = new Hono();
      testApp.route("/api/wallets", mockedRoutes);

      const user = await createUser("member@example.com");
      const org = await createOrg("Team", "team");
      await addMember(user.id, org.id, "member");

      await db
        .insertInto("admin_settings")
        .values({
          minimum_balance_sol: 0.001,
          minimum_balance_usdc: 0.01,
        })
        .execute();

      const wallet = await db
        .insertInto("wallets")
        .values({
          name: "Pending Wallet",
          organization_id: org.id,
          wallet_config: JSON.stringify(validWalletConfig()),
          funding_status: "pending",
          balances_cached_at: new Date(Date.now() - 120000).toISOString(),
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      const before = await db
        .selectFrom("wallets")
        .select("funding_status")
        .where("id", "=", wallet.id)
        .executeTakeFirstOrThrow();
      t.equal(before.funding_status, "pending");

      const res = await testApp.request(`/api/wallets/${wallet.id}/balances`, {
        headers: { Cookie: `auth_token=${user.token}` },
      });

      t.equal(res.status, 200);

      const after = await db
        .selectFrom("wallets")
        .select("funding_status")
        .where("id", "=", wallet.id)
        .executeTakeFirstOrThrow();
      t.equal(after.funding_status, "funded");
    },
  );
});

await t.test("POST /api/wallets/organization/:orgId", async (t) => {
  await t.test("returns 404 for non-member", async (t) => {
    const user = await createUser("outsider@example.com");
    const org = await createOrg("Team", "team");

    const res = await app.request(`/api/wallets/organization/${org.id}`, {
      method: "POST",
      headers: {
        Cookie: `auth_token=${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "New Wallet",
        wallet_config: validWalletConfig(),
      }),
    });

    t.equal(res.status, 404);
  });

  await t.test("returns 403 for non-owner member", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id, "member");

    const res = await app.request(`/api/wallets/organization/${org.id}`, {
      method: "POST",
      headers: {
        Cookie: `auth_token=${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "New Wallet",
        wallet_config: validWalletConfig(),
      }),
    });

    t.equal(res.status, 403);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.ok(data.error.includes("owners"));
  });

  await t.test("returns 400 for wallet config with no addresses", async (t) => {
    const user = await createUser("owner@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id, "owner");

    const res = await app.request(`/api/wallets/organization/${org.id}`, {
      method: "POST",
      headers: {
        Cookie: `auth_token=${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Empty Wallet",
        wallet_config: {},
      }),
    });

    t.equal(res.status, 400);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.ok(data.error.includes("address"));
  });

  await t.test("creates wallet for owner", async (t) => {
    const user = await createUser("owner@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id, "owner");

    const res = await app.request(`/api/wallets/organization/${org.id}`, {
      method: "POST",
      headers: {
        Cookie: `auth_token=${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "My Wallet",
        wallet_config: validWalletConfig(),
      }),
    });

    t.equal(res.status, 201);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.name, "My Wallet");
    t.equal(data.organization_id, org.id);
    t.equal(data.funding_status, "pending");
  });

  await t.test("admin can create wallet in any org", async (t) => {
    const admin = await createUser("admin@example.com", true);
    const org = await createOrg("Team", "team");

    const res = await app.request(`/api/wallets/organization/${org.id}`, {
      method: "POST",
      headers: {
        Cookie: `auth_token=${admin.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Admin Created",
        wallet_config: validWalletConfig(),
      }),
    });

    t.equal(res.status, 201);
  });

  await t.test("returns 400 for missing name", async (t) => {
    const user = await createUser("owner@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id, "owner");

    const res = await app.request(`/api/wallets/organization/${org.id}`, {
      method: "POST",
      headers: {
        Cookie: `auth_token=${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        wallet_config: validWalletConfig(),
      }),
    });

    t.equal(res.status, 400);
  });
});

await t.test("PUT /api/wallets/:id", async (t) => {
  await t.test("returns 404 for non-existent wallet", async (t) => {
    const user = await createUser("owner@example.com");

    const res = await app.request("/api/wallets/9999", {
      method: "PUT",
      headers: {
        Cookie: `auth_token=${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Updated" }),
    });

    t.equal(res.status, 404);
  });

  await t.test("returns 403 for non-owner member", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id, "member");

    const wallet = await db
      .insertInto("wallets")
      .values({
        name: "Team Wallet",
        organization_id: org.id,
        wallet_config: JSON.stringify(validWalletConfig()),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const res = await app.request(`/api/wallets/${wallet.id}`, {
      method: "PUT",
      headers: {
        Cookie: `auth_token=${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Hacked" }),
    });

    t.equal(res.status, 403);
  });

  await t.test("returns 404 for master wallet when not admin", async (t) => {
    const user = await createUser("member@example.com");

    const wallet = await db
      .insertInto("wallets")
      .values({
        name: "Master Wallet",
        organization_id: null,
        wallet_config: JSON.stringify(validWalletConfig()),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const res = await app.request(`/api/wallets/${wallet.id}`, {
      method: "PUT",
      headers: {
        Cookie: `auth_token=${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Hacked" }),
    });

    t.equal(res.status, 404);
  });

  await t.test("updates wallet name for owner", async (t) => {
    const user = await createUser("owner@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id, "owner");

    const wallet = await db
      .insertInto("wallets")
      .values({
        name: "Old Name",
        organization_id: org.id,
        wallet_config: JSON.stringify(validWalletConfig()),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const res = await app.request(`/api/wallets/${wallet.id}`, {
      method: "PUT",
      headers: {
        Cookie: `auth_token=${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "New Name" }),
    });

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.name, "New Name");
  });

  await t.test("updating wallet_config resets funding status", async (t) => {
    const user = await createUser("owner@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id, "owner");

    const wallet = await db
      .insertInto("wallets")
      .values({
        name: "Funded Wallet",
        organization_id: org.id,
        wallet_config: JSON.stringify(validWalletConfig()),
        funding_status: "funded",
        cached_balances: JSON.stringify({ sol: 1 }),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const newConfig = {
      solana: {
        "mainnet-beta": {
          address: "NewAddress111111111111111111111111111111111",
        },
      },
    };

    const res = await app.request(`/api/wallets/${wallet.id}`, {
      method: "PUT",
      headers: {
        Cookie: `auth_token=${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ wallet_config: newConfig }),
    });

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.funding_status, "pending");
    t.equal(data.cached_balances, null);
  });

  await t.test("returns unchanged wallet for empty update", async (t) => {
    const user = await createUser("owner@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id, "owner");

    const wallet = await db
      .insertInto("wallets")
      .values({
        name: "Unchanged",
        organization_id: org.id,
        wallet_config: JSON.stringify(validWalletConfig()),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const res = await app.request(`/api/wallets/${wallet.id}`, {
      method: "PUT",
      headers: {
        Cookie: `auth_token=${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.name, "Unchanged");
  });

  await t.test("admin can update any wallet", async (t) => {
    const admin = await createUser("admin@example.com", true);
    const org = await createOrg("Team", "team");

    const wallet = await db
      .insertInto("wallets")
      .values({
        name: "Any Wallet",
        organization_id: org.id,
        wallet_config: JSON.stringify(validWalletConfig()),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const res = await app.request(`/api/wallets/${wallet.id}`, {
      method: "PUT",
      headers: {
        Cookie: `auth_token=${admin.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Admin Updated" }),
    });

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.name, "Admin Updated");
  });
});

await t.test("DELETE /api/wallets/:id", async (t) => {
  await t.test("returns 404 for non-existent wallet", async (t) => {
    const user = await createUser("owner@example.com");

    const res = await app.request("/api/wallets/9999", {
      method: "DELETE",
      headers: { Cookie: `auth_token=${user.token}` },
    });

    t.equal(res.status, 404);
  });

  await t.test("returns 403 for non-owner member", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id, "member");

    const wallet = await db
      .insertInto("wallets")
      .values({
        name: "Team Wallet",
        organization_id: org.id,
        wallet_config: JSON.stringify(validWalletConfig()),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const res = await app.request(`/api/wallets/${wallet.id}`, {
      method: "DELETE",
      headers: { Cookie: `auth_token=${user.token}` },
    });

    t.equal(res.status, 403);
  });

  await t.test("returns 404 for master wallet when not admin", async (t) => {
    const user = await createUser("member@example.com");

    const wallet = await db
      .insertInto("wallets")
      .values({
        name: "Master Wallet",
        organization_id: null,
        wallet_config: JSON.stringify(validWalletConfig()),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const res = await app.request(`/api/wallets/${wallet.id}`, {
      method: "DELETE",
      headers: { Cookie: `auth_token=${user.token}` },
    });

    t.equal(res.status, 404);
  });

  await t.test("returns 400 when wallet assigned to tenants", async (t) => {
    const user = await createUser("owner@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id, "owner");

    const wallet = await db
      .insertInto("wallets")
      .values({
        name: "Used Wallet",
        organization_id: org.id,
        wallet_config: JSON.stringify(validWalletConfig()),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .insertInto("tenants")
      .values({
        name: "proxy-using-wallet",
        backend_url: "http://backend.com",
        organization_id: org.id,
        wallet_id: wallet.id,
        default_price_usdc: 0.01,
        default_scheme: "exact",
      })
      .execute();

    const res = await app.request(`/api/wallets/${wallet.id}`, {
      method: "DELETE",
      headers: { Cookie: `auth_token=${user.token}` },
    });

    t.equal(res.status, 400);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.ok(data.error.includes("tenants"));
  });

  await t.test("deletes wallet for owner", async (t) => {
    const user = await createUser("owner@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id, "owner");

    const wallet = await db
      .insertInto("wallets")
      .values({
        name: "To Delete",
        organization_id: org.id,
        wallet_config: JSON.stringify(validWalletConfig()),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const res = await app.request(`/api/wallets/${wallet.id}`, {
      method: "DELETE",
      headers: { Cookie: `auth_token=${user.token}` },
    });

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.success, true);

    const check = await db
      .selectFrom("wallets")
      .select("id")
      .where("id", "=", wallet.id)
      .executeTakeFirst();
    t.equal(check, undefined);
  });

  await t.test("admin can delete any wallet", async (t) => {
    const admin = await createUser("admin@example.com", true);
    const org = await createOrg("Team", "team");

    const wallet = await db
      .insertInto("wallets")
      .values({
        name: "Any Wallet",
        organization_id: org.id,
        wallet_config: JSON.stringify(validWalletConfig()),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const res = await app.request(`/api/wallets/${wallet.id}`, {
      method: "DELETE",
      headers: { Cookie: `auth_token=${admin.token}` },
    });

    t.equal(res.status, 200);
  });
});

await t.test("GET /api/wallets/admin/master", async (t) => {
  await t.test("returns 403 for non-admin", async (t) => {
    const user = await createUser("member@example.com");

    const res = await app.request("/api/wallets/admin/master", {
      headers: { Cookie: `auth_token=${user.token}` },
    });

    t.equal(res.status, 403);
  });

  await t.test("returns empty list when no master wallets", async (t) => {
    const admin = await createUser("admin@example.com", true);

    const res = await app.request("/api/wallets/admin/master", {
      headers: { Cookie: `auth_token=${admin.token}` },
    });

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.same(data, []);
  });

  await t.test("returns only master wallets", async (t) => {
    const admin = await createUser("admin@example.com", true);
    const org = await createOrg("Team", "team");

    await db
      .insertInto("wallets")
      .values({
        name: "Master Wallet",
        organization_id: null,
        wallet_config: JSON.stringify(validWalletConfig()),
      })
      .execute();

    await db
      .insertInto("wallets")
      .values({
        name: "Org Wallet",
        organization_id: org.id,
        wallet_config: JSON.stringify(validWalletConfig()),
      })
      .execute();

    const res = await app.request("/api/wallets/admin/master", {
      headers: { Cookie: `auth_token=${admin.token}` },
    });

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.length, 1);
    t.equal(data[0].name, "Master Wallet");
    t.equal(data[0].organization_id, null);
  });
});

await t.test("POST /api/wallets/admin/master", async (t) => {
  await t.test("returns 403 for non-admin", async (t) => {
    const user = await createUser("member@example.com");

    const res = await app.request("/api/wallets/admin/master", {
      method: "POST",
      headers: {
        Cookie: `auth_token=${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Hacked Master",
        wallet_config: validWalletConfig(),
      }),
    });

    t.equal(res.status, 403);
  });

  await t.test("creates master wallet for admin", async (t) => {
    const admin = await createUser("admin@example.com", true);

    const res = await app.request("/api/wallets/admin/master", {
      method: "POST",
      headers: {
        Cookie: `auth_token=${admin.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "New Master",
        wallet_config: validWalletConfig(),
      }),
    });

    t.equal(res.status, 201);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.name, "New Master");
    t.equal(data.organization_id, null);
    t.equal(data.funding_status, "funded");
  });
});

await t.test(
  "POST /api/wallets/organization/:orgId - chain configs",
  async (t) => {
    await t.test("creates wallet with Solana-only config", async (t) => {
      const user = await createUser("owner@example.com");
      const org = await createOrg("Team", "team");
      await addMember(user.id, org.id, "owner");

      const solanaOnlyConfig = {
        solana: {
          "mainnet-beta": {
            address: "So11111111111111111111111111111111111111112",
          },
        },
      };

      const res = await app.request(`/api/wallets/organization/${org.id}`, {
        method: "POST",
        headers: {
          Cookie: `auth_token=${user.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Solana Only Wallet",
          wallet_config: solanaOnlyConfig,
        }),
      });

      t.equal(res.status, 201);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.equal(data.name, "Solana Only Wallet");
      // wallet_config is auto-parsed by SQLite adapter plugin
      t.ok(data.wallet_config.solana);
      t.notOk(data.wallet_config.evm);
    });

    await t.test("creates wallet with EVM-only config (Base)", async (t) => {
      const user = await createUser("owner@example.com");
      const org = await createOrg("Team", "team");
      await addMember(user.id, org.id, "owner");

      // EVM config structure: evm.base.address (not base.mainnet.address)
      const evmOnlyConfig = {
        evm: {
          base: {
            address: "0x1234567890123456789012345678901234567890",
          },
        },
      };

      const res = await app.request(`/api/wallets/organization/${org.id}`, {
        method: "POST",
        headers: {
          Cookie: `auth_token=${user.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Base Only Wallet",
          wallet_config: evmOnlyConfig,
        }),
      });

      t.equal(res.status, 201);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.equal(data.name, "Base Only Wallet");
      // wallet_config is auto-parsed by SQLite adapter plugin
      t.ok(data.wallet_config.evm);
      t.notOk(data.wallet_config.solana);
    });
  },
);

await t.test(
  "POST /api/wallets/organization/:orgId - funding status based on chain type",
  async (t) => {
    await t.test(
      "Solana-only wallet is created with pending status",
      async (t) => {
        const user = await createUser("owner@example.com");
        const org = await createOrg("Team", "team");
        await addMember(user.id, org.id, "owner");

        const solanaConfig = {
          solana: {
            "mainnet-beta": {
              address: "So11111111111111111111111111111111111111112",
            },
          },
        };

        const res = await app.request(`/api/wallets/organization/${org.id}`, {
          method: "POST",
          headers: {
            Cookie: `auth_token=${user.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: "Solana Wallet",
            wallet_config: solanaConfig,
          }),
        });

        t.equal(res.status, 201);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = (await res.json()) as any;
        t.equal(data.funding_status, "pending");
      },
    );

    await t.test(
      "EVM-only wallet is created and marked as funded immediately",
      async (t) => {
        const user = await createUser("owner@example.com");
        const org = await createOrg("Team", "team");
        await addMember(user.id, org.id, "owner");

        const evmConfig = {
          evm: {
            base: {
              address: "0x1234567890123456789012345678901234567890",
            },
          },
        };

        const res = await app.request(`/api/wallets/organization/${org.id}`, {
          method: "POST",
          headers: {
            Cookie: `auth_token=${user.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: "EVM Wallet",
            wallet_config: evmConfig,
          }),
        });

        t.equal(res.status, 201);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = (await res.json()) as any;
        // Initial response shows pending, but enqueueBalanceCheck marks it as funded
        // We need to refetch to see the updated status
        const refetch = await app.request(`/api/wallets/${data.id}`, {
          headers: { Cookie: `auth_token=${user.token}` },
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updated = (await refetch.json()) as any;
        t.equal(updated.funding_status, "funded");
      },
    );

    await t.test(
      "Mixed wallet (Solana+EVM) is created with pending status",
      async (t) => {
        const user = await createUser("owner@example.com");
        const org = await createOrg("Team", "team");
        await addMember(user.id, org.id, "owner");

        const mixedConfig = {
          solana: {
            "mainnet-beta": {
              address: "So11111111111111111111111111111111111111112",
            },
          },
          evm: {
            base: {
              address: "0x1234567890123456789012345678901234567890",
            },
          },
        };

        const res = await app.request(`/api/wallets/organization/${org.id}`, {
          method: "POST",
          headers: {
            Cookie: `auth_token=${user.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: "Mixed Wallet",
            wallet_config: mixedConfig,
          }),
        });

        t.equal(res.status, 201);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = (await res.json()) as any;
        // Mixed wallet has Solana, so it stays pending (needs Solana funding check)
        t.equal(data.funding_status, "pending");
      },
    );
  },
);

await t.test("PUT /api/wallets/:id - funding status updates", async (t) => {
  await t.test("updating to EVM-only config sets funded status", async (t) => {
    const user = await createUser("owner@example.com");
    const org = await createOrg("Team", "team");
    await addMember(user.id, org.id, "owner");

    // Create wallet with Solana (pending)
    const wallet = await db
      .insertInto("wallets")
      .values({
        name: "Will Become EVM",
        organization_id: org.id,
        wallet_config: JSON.stringify({
          solana: {
            "mainnet-beta": {
              address: "So11111111111111111111111111111111111111112",
            },
          },
        }),
        funding_status: "pending",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    // Update to EVM-only config
    const evmConfig = {
      evm: {
        base: {
          address: "0x1234567890123456789012345678901234567890",
        },
      },
    };

    const res = await app.request(`/api/wallets/${wallet.id}`, {
      method: "PUT",
      headers: {
        Cookie: `auth_token=${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ wallet_config: evmConfig }),
    });

    t.equal(res.status, 200);

    // Refetch to see the updated status (after enqueueBalanceCheck runs)
    const refetch = await app.request(`/api/wallets/${wallet.id}`, {
      headers: { Cookie: `auth_token=${user.token}` },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = (await refetch.json()) as any;
    t.equal(updated.funding_status, "funded");
  });

  await t.test(
    "updating from EVM-only to Solana resets to pending status",
    async (t) => {
      const user = await createUser("owner@example.com");
      const org = await createOrg("Team", "team");
      await addMember(user.id, org.id, "owner");

      // Create wallet with EVM (will be funded)
      const wallet = await db
        .insertInto("wallets")
        .values({
          name: "Will Become Solana",
          organization_id: org.id,
          wallet_config: JSON.stringify({
            evm: {
              base: {
                address: "0x1234567890123456789012345678901234567890",
              },
            },
          }),
          funding_status: "funded",
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      // Update to Solana config
      const solanaConfig = {
        solana: {
          "mainnet-beta": {
            address: "So11111111111111111111111111111111111111112",
          },
        },
      };

      const res = await app.request(`/api/wallets/${wallet.id}`, {
        method: "PUT",
        headers: {
          Cookie: `auth_token=${user.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ wallet_config: solanaConfig }),
      });

      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      // Updated config resets to pending
      t.equal(data.funding_status, "pending");
    },
  );
});
