import "../tests/setup/env.js";
import t from "tap";
import { Hono } from "hono";
import { db, setupTestSchema, clearTestData } from "../db/instance.js";
import { signToken } from "../middleware/auth.js";
import { organizationsRoutes } from "./organizations.js";
import {
  enableCorbitsMock,
  disableCorbitsMock,
} from "../tests/setup/corbits-mock.js";

const app = new Hono();
app.route("/api/organizations", organizationsRoutes);

await setupTestSchema();
enableCorbitsMock();
t.teardown(() => disableCorbitsMock());

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

t.beforeEach(async () => {
  await clearTestData();
});

await t.test("GET /api/organizations", async (t) => {
  await t.test("returns 401 without auth", async (t) => {
    const res = await app.request("/api/organizations");
    t.equal(res.status, 401);
  });

  await t.test("returns empty list for new user", async (t) => {
    const user = await createUser("new@example.com");
    const res = await app.request("/api/organizations", {
      headers: { Cookie: `auth_token=${user.token}` },
    });
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.same(data, []);
  });

  await t.test("returns user's organizations", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Test Org", "test-org");
    await addMember(user.id, org.id, "owner");

    const res = await app.request("/api/organizations", {
      headers: { Cookie: `auth_token=${user.token}` },
    });
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.length, 1);
    t.equal(data[0].name, "Test Org");
    t.equal(data[0].role, "owner");
  });
});

await t.test("POST /api/organizations", async (t) => {
  await t.test("creates organization", async (t) => {
    const user = await createUser("creator@example.com");

    const res = await app.request("/api/organizations", {
      method: "POST",
      headers: {
        Cookie: `auth_token=${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "New Org" }),
    });

    t.equal(res.status, 201);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.name, "New Org");
    t.equal(data.role, "owner");
    t.ok(data.slug);
  });

  await t.test("creates organization with custom slug", async (t) => {
    const user = await createUser("slug@example.com");

    const res = await app.request("/api/organizations", {
      method: "POST",
      headers: {
        Cookie: `auth_token=${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Custom Slug Org", slug: "my-custom-slug" }),
    });

    t.equal(res.status, 201);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.slug, "my-custom-slug");
  });

  await t.test("handles duplicate slug by appending timestamp", async (t) => {
    const user = await createUser("dup@example.com");
    await createOrg("Existing", "existing-slug");

    const res = await app.request("/api/organizations", {
      method: "POST",
      headers: {
        Cookie: `auth_token=${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "New Org", slug: "existing-slug" }),
    });

    t.equal(res.status, 201);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.ok(data.slug.startsWith("existing-slug-"));
    t.not(data.slug, "existing-slug");
  });

  await t.test("enforces org limit per user", async (t) => {
    const user = await createUser("limit@example.com");

    for (let i = 0; i < 5; i++) {
      const org = await createOrg(`Org ${i}`, `org-${i}`);
      await addMember(user.id, org.id, "owner");
    }

    const res = await app.request("/api/organizations", {
      method: "POST",
      headers: {
        Cookie: `auth_token=${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Sixth Org" }),
    });

    t.equal(res.status, 400);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.ok(data.error.includes("5 organizations"));
  });
});

await t.test("GET /api/organizations/:id", async (t) => {
  await t.test("returns 404 for non-member", async (t) => {
    const user = await createUser("nonmember@example.com");
    const org = await createOrg("Private Org", "private-org");

    const res = await app.request(`/api/organizations/${org.id}`, {
      headers: { Cookie: `auth_token=${user.token}` },
    });
    t.equal(res.status, 404);
  });

  await t.test("returns org details for member", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("My Org", "my-org");
    await addMember(user.id, org.id, "member");

    const res = await app.request(`/api/organizations/${org.id}`, {
      headers: { Cookie: `auth_token=${user.token}` },
    });
    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.name, "My Org");
    t.equal(data.role, "member");
  });

  await t.test("admin can view any org", async (t) => {
    const admin = await createUser("admin@example.com", true);
    const org = await createOrg("Any Org", "any-org");

    const res = await app.request(`/api/organizations/${org.id}`, {
      headers: { Cookie: `auth_token=${admin.token}` },
    });
    t.equal(res.status, 200);
  });
});

await t.test("PUT /api/organizations/:id", async (t) => {
  await t.test("owner can update org", async (t) => {
    const user = await createUser("owner@example.com");
    const org = await createOrg("Old Name", "old-slug");
    await addMember(user.id, org.id, "owner");

    const res = await app.request(`/api/organizations/${org.id}`, {
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

  await t.test("member cannot update org", async (t) => {
    const user = await createUser("member@example.com");
    const org = await createOrg("Org", "org");
    await addMember(user.id, org.id, "member");

    const res = await app.request(`/api/organizations/${org.id}`, {
      method: "PUT",
      headers: {
        Cookie: `auth_token=${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Changed" }),
    });

    t.equal(res.status, 403);
  });

  await t.test("rejects duplicate slug", async (t) => {
    const user = await createUser("slugdup@example.com");
    const org1 = await createOrg("Org 1", "org-1");
    await createOrg("Org 2", "org-2");
    await addMember(user.id, org1.id, "owner");

    const res = await app.request(`/api/organizations/${org1.id}`, {
      method: "PUT",
      headers: {
        Cookie: `auth_token=${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ slug: "org-2" }),
    });

    t.equal(res.status, 409);
  });
});

await t.test("DELETE /api/organizations/:id", async (t) => {
  await t.test("owner can delete org", async (t) => {
    const user = await createUser("delowner@example.com");
    const org = await createOrg("To Delete", "to-delete");
    await addMember(user.id, org.id, "owner");

    const res = await app.request(`/api/organizations/${org.id}`, {
      method: "DELETE",
      headers: { Cookie: `auth_token=${user.token}` },
    });

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.deleted, true);

    const check = await db
      .selectFrom("organizations")
      .select("id")
      .where("id", "=", org.id)
      .executeTakeFirst();
    t.equal(check, undefined);
  });

  await t.test("member cannot delete org", async (t) => {
    const user = await createUser("delmember@example.com");
    const org = await createOrg("Protected", "protected");
    await addMember(user.id, org.id, "member");

    const res = await app.request(`/api/organizations/${org.id}`, {
      method: "DELETE",
      headers: { Cookie: `auth_token=${user.token}` },
    });

    t.equal(res.status, 403);
  });
});

await t.test("GET /api/organizations/:id/members", async (t) => {
  await t.test("returns members list", async (t) => {
    const owner = await createUser("owner@example.com");
    const member = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(owner.id, org.id, "owner");
    await addMember(member.id, org.id, "member");

    const res = await app.request(`/api/organizations/${org.id}/members`, {
      headers: { Cookie: `auth_token=${owner.token}` },
    });

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.length, 2);
  });

  await t.test("non-member cannot see members", async (t) => {
    const user = await createUser("outsider@example.com");
    const org = await createOrg("Private Team", "private-team");

    const res = await app.request(`/api/organizations/${org.id}/members`, {
      headers: { Cookie: `auth_token=${user.token}` },
    });

    t.equal(res.status, 404);
  });
});

await t.test("POST /api/organizations/:id/members", async (t) => {
  await t.test("owner can add member", async (t) => {
    const owner = await createUser("owner@example.com");
    const newUser = await createUser("newmember@example.com");
    const org = await createOrg("Team", "team");
    await addMember(owner.id, org.id, "owner");

    const res = await app.request(`/api/organizations/${org.id}/members`, {
      method: "POST",
      headers: {
        Cookie: `auth_token=${owner.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "newmember@example.com", role: "member" }),
    });

    t.equal(res.status, 201);

    const membership = await db
      .selectFrom("user_organizations")
      .select("role")
      .where("user_id", "=", newUser.id)
      .where("organization_id", "=", org.id)
      .executeTakeFirst();
    t.equal(membership?.role, "member");
  });

  await t.test("cannot add non-existent user", async (t) => {
    const owner = await createUser("owner@example.com");
    const org = await createOrg("Team", "team");
    await addMember(owner.id, org.id, "owner");

    const res = await app.request(`/api/organizations/${org.id}/members`, {
      method: "POST",
      headers: {
        Cookie: `auth_token=${owner.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "nobody@example.com" }),
    });

    t.equal(res.status, 404);
  });

  await t.test("cannot add existing member", async (t) => {
    const owner = await createUser("owner@example.com");
    const member = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(owner.id, org.id, "owner");
    await addMember(member.id, org.id, "member");

    const res = await app.request(`/api/organizations/${org.id}/members`, {
      method: "POST",
      headers: {
        Cookie: `auth_token=${owner.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "member@example.com" }),
    });

    t.equal(res.status, 409);
  });

  await t.test("regular member cannot add members", async (t) => {
    const owner = await createUser("owner@example.com");
    const member = await createUser("member@example.com");
    await createUser("new@example.com");
    const org = await createOrg("Team", "team");
    await addMember(owner.id, org.id, "owner");
    await addMember(member.id, org.id, "member");

    const res = await app.request(`/api/organizations/${org.id}/members`, {
      method: "POST",
      headers: {
        Cookie: `auth_token=${member.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "new@example.com" }),
    });

    t.equal(res.status, 403);
  });
});

await t.test("DELETE /api/organizations/:id/members/:userId", async (t) => {
  await t.test("owner can remove member", async (t) => {
    const owner = await createUser("owner@example.com");
    const member = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(owner.id, org.id, "owner");
    await addMember(member.id, org.id, "member");

    const res = await app.request(
      `/api/organizations/${org.id}/members/${member.id}`,
      {
        method: "DELETE",
        headers: { Cookie: `auth_token=${owner.token}` },
      },
    );

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.deleted, true);
  });

  await t.test("member can remove themselves", async (t) => {
    const owner = await createUser("owner@example.com");
    const member = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(owner.id, org.id, "owner");
    await addMember(member.id, org.id, "member");

    const res = await app.request(
      `/api/organizations/${org.id}/members/${member.id}`,
      {
        method: "DELETE",
        headers: { Cookie: `auth_token=${member.token}` },
      },
    );

    t.equal(res.status, 200);
  });

  await t.test("member cannot remove others", async (t) => {
    const owner = await createUser("owner@example.com");
    const member1 = await createUser("member1@example.com");
    const member2 = await createUser("member2@example.com");
    const org = await createOrg("Team", "team");
    await addMember(owner.id, org.id, "owner");
    await addMember(member1.id, org.id, "member");
    await addMember(member2.id, org.id, "member");

    const res = await app.request(
      `/api/organizations/${org.id}/members/${member2.id}`,
      {
        method: "DELETE",
        headers: { Cookie: `auth_token=${member1.token}` },
      },
    );

    t.equal(res.status, 403);
  });
});

await t.test("GET /api/organizations/:id/invitations", async (t) => {
  await t.test("returns pending invitations", async (t) => {
    const owner = await createUser("owner@example.com");
    const org = await createOrg("Team", "team");
    await addMember(owner.id, org.id, "owner");

    await db
      .insertInto("organization_invitations")
      .values({
        organization_id: org.id,
        email: "invited@example.com",
        token: "invite-token",
        role: "member",
        invited_by: owner.id,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      })
      .execute();

    const res = await app.request(`/api/organizations/${org.id}/invitations`, {
      headers: { Cookie: `auth_token=${owner.token}` },
    });

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.length, 1);
    t.equal(data[0].email, "invited@example.com");
  });
});

await t.test("POST /api/organizations/:id/invitations", async (t) => {
  await t.test("creates invitation", async (t) => {
    const owner = await createUser("owner@example.com");
    const org = await createOrg("Team", "team");
    await addMember(owner.id, org.id, "owner");

    const res = await app.request(`/api/organizations/${org.id}/invitations`, {
      method: "POST",
      headers: {
        Cookie: `auth_token=${owner.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "newinvite@example.com", role: "member" }),
    });

    t.equal(res.status, 201);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.email, "newinvite@example.com");
    t.ok(data.token);
  });

  await t.test("cannot invite existing member", async (t) => {
    const owner = await createUser("owner@example.com");
    const member = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(owner.id, org.id, "owner");
    await addMember(member.id, org.id, "member");

    const res = await app.request(`/api/organizations/${org.id}/invitations`, {
      method: "POST",
      headers: {
        Cookie: `auth_token=${owner.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "member@example.com" }),
    });

    t.equal(res.status, 409);
  });

  await t.test("cannot create duplicate invitation", async (t) => {
    const owner = await createUser("owner@example.com");
    const org = await createOrg("Team", "team");
    await addMember(owner.id, org.id, "owner");

    await db
      .insertInto("organization_invitations")
      .values({
        organization_id: org.id,
        email: "pending@example.com",
        token: "existing-token",
        role: "member",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      })
      .execute();

    const res = await app.request(`/api/organizations/${org.id}/invitations`, {
      method: "POST",
      headers: {
        Cookie: `auth_token=${owner.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "pending@example.com" }),
    });

    t.equal(res.status, 409);
  });
});

await t.test(
  "DELETE /api/organizations/:id/invitations/:invitationId",
  async (t) => {
    await t.test("owner can cancel invitation", async (t) => {
      const owner = await createUser("owner@example.com");
      const org = await createOrg("Team", "team");
      await addMember(owner.id, org.id, "owner");

      const invitation = await db
        .insertInto("organization_invitations")
        .values({
          organization_id: org.id,
          email: "cancel@example.com",
          token: "cancel-token",
          role: "member",
          expires_at: new Date(Date.now() + 86400000).toISOString(),
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      const res = await app.request(
        `/api/organizations/${org.id}/invitations/${invitation.id}`,
        {
          method: "DELETE",
          headers: { Cookie: `auth_token=${owner.token}` },
        },
      );

      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.equal(data.deleted, true);
    });

    await t.test("returns 404 for non-existent invitation", async (t) => {
      const owner = await createUser("owner@example.com");
      const org = await createOrg("Team", "team");
      await addMember(owner.id, org.id, "owner");

      const res = await app.request(
        `/api/organizations/${org.id}/invitations/9999`,
        {
          method: "DELETE",
          headers: { Cookie: `auth_token=${owner.token}` },
        },
      );

      t.equal(res.status, 404);
    });
  },
);

await t.test("GET /api/organizations/:id/tenants", async (t) => {
  await t.test("returns empty list", async (t) => {
    const owner = await createUser("owner@example.com");
    const org = await createOrg("Team", "team");
    await addMember(owner.id, org.id, "owner");

    const res = await app.request(`/api/organizations/${org.id}/tenants`, {
      headers: { Cookie: `auth_token=${owner.token}` },
    });

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.same(data, []);
  });

  await t.test("returns org tenants with nodes", async (t) => {
    const owner = await createUser("owner@example.com");
    const org = await createOrg("Team", "team");
    await addMember(owner.id, org.id, "owner");

    const tenant = await db
      .insertInto("tenants")
      .values({
        name: "my-proxy",
        backend_url: "http://backend.com",
        organization_id: org.id,
        default_price_usdc: 0.01,
        default_scheme: "exact",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const node = await db
      .insertInto("nodes")
      .values({
        name: "node1",
        internal_ip: "10.0.0.1",
        public_ip: "1.2.3.4",
        status: "active",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .insertInto("tenant_nodes")
      .values({
        tenant_id: tenant.id,
        node_id: node.id,
        is_primary: true,
      })
      .execute();

    const res = await app.request(`/api/organizations/${org.id}/tenants`, {
      headers: { Cookie: `auth_token=${owner.token}` },
    });

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.length, 1);
    t.equal(data[0].name, "my-proxy");
    t.equal(data[0].nodes.length, 1);
  });
});

await t.test("GET /api/organizations/:id/tenants/check-name", async (t) => {
  await t.test("returns available true for unused name", async (t) => {
    const owner = await createUser("owner@example.com");
    const org = await createOrg("Team", "team");
    await addMember(owner.id, org.id, "owner");

    const res = await app.request(
      `/api/organizations/${org.id}/tenants/check-name?name=new-proxy`,
      {
        headers: { Cookie: `auth_token=${owner.token}` },
      },
    );

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.available, true);
  });

  await t.test(
    "returns available false for name used in same org",
    async (t) => {
      const owner = await createUser("owner@example.com");
      const org = await createOrg("Team", "team");
      await addMember(owner.id, org.id, "owner");

      await db
        .insertInto("tenants")
        .values({
          name: "existing-proxy",
          organization_id: org.id,
          org_slug: "team",
          backend_url: "http://backend.com",
          default_price_usdc: 0.01,
          default_scheme: "exact",
        })
        .execute();

      const res = await app.request(
        `/api/organizations/${org.id}/tenants/check-name?name=existing-proxy`,
        {
          headers: { Cookie: `auth_token=${owner.token}` },
        },
      );

      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.equal(data.available, false);
    },
  );

  await t.test(
    "returns available for name used by legacy tenant (no conflict)",
    async (t) => {
      const owner = await createUser("owner@example.com");
      const org = await createOrg("Team", "team");
      await addMember(owner.id, org.id, "owner");

      await db
        .insertInto("tenants")
        .values({
          name: "legacy-api",
          backend_url: "http://backend.com",
          default_price_usdc: 0.01,
          default_scheme: "exact",
          org_slug: null,
        })
        .execute();

      const res = await app.request(
        `/api/organizations/${org.id}/tenants/check-name?name=legacy-api`,
        {
          headers: { Cookie: `auth_token=${owner.token}` },
        },
      );

      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.equal(data.available, true);
    },
  );

  await t.test(
    "returns available for name used in different org with org_slug format",
    async (t) => {
      const owner = await createUser("owner@example.com");
      const org1 = await createOrg("Org One", "org-one");
      const org2 = await createOrg("Org Two", "org-two");
      await addMember(owner.id, org1.id, "owner");
      await addMember(owner.id, org2.id, "owner");

      // Create org_slug tenant in org1
      await db
        .insertInto("tenants")
        .values({
          name: "shared-api",
          organization_id: org1.id,
          backend_url: "http://backend.com",
          default_price_usdc: 0.01,
          default_scheme: "exact",
          org_slug: "org-one",
        })
        .execute();

      // Check availability in org2
      const res = await app.request(
        `/api/organizations/${org2.id}/tenants/check-name?name=shared-api`,
        {
          headers: { Cookie: `auth_token=${owner.token}` },
        },
      );

      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.equal(data.available, true);
    },
  );

  await t.test(
    "returns unavailable for name used in same org with org_slug format",
    async (t) => {
      const owner = await createUser("owner@example.com");
      const org = await createOrg("Team", "team");
      await addMember(owner.id, org.id, "owner");

      // Create org_slug tenant in same org
      await db
        .insertInto("tenants")
        .values({
          name: "taken-api",
          organization_id: org.id,
          backend_url: "http://backend.com",
          default_price_usdc: 0.01,
          default_scheme: "exact",
          org_slug: "team",
        })
        .execute();

      const res = await app.request(
        `/api/organizations/${org.id}/tenants/check-name?name=taken-api`,
        {
          headers: { Cookie: `auth_token=${owner.token}` },
        },
      );

      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.equal(data.available, false);
    },
  );
});

await t.test("GET /api/organizations/:id/can-create-proxy", async (t) => {
  await t.test("returns no_wallet when org has no wallets", async (t) => {
    const owner = await createUser("owner@example.com");
    const org = await createOrg("Team", "team");
    await addMember(owner.id, org.id, "owner");

    const res = await app.request(
      `/api/organizations/${org.id}/can-create-proxy`,
      {
        headers: { Cookie: `auth_token=${owner.token}` },
      },
    );

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.available, false);
    t.equal(data.reason, "no_wallet");
  });

  await t.test(
    "returns available true for funded wallet with cached balances",
    async (t) => {
      const owner = await createUser("owner@example.com");
      const org = await createOrg("Team", "team");
      await addMember(owner.id, org.id, "owner");

      await db
        .insertInto("wallets")
        .values({
          name: "Test Wallet",
          organization_id: org.id,
          wallet_config: JSON.stringify({
            type: "solana",
            publicKey: "abc123",
          }),
          funding_status: "funded",
          cached_balances: JSON.stringify({
            solana: { native: "1.0", usdc: "10.0" },
            base: { native: "0", usdc: "0" },
            polygon: { native: "0", usdc: "0" },
            monad: { native: "0", usdc: "0" },
          }),
          balances_cached_at: new Date().toISOString(),
        })
        .execute();

      await db
        .insertInto("admin_settings")
        .values({
          minimum_balance_sol: 0.001,
          minimum_balance_usdc: 0.01,
        })
        .execute();

      const res = await app.request(
        `/api/organizations/${org.id}/can-create-proxy`,
        {
          headers: { Cookie: `auth_token=${owner.token}` },
        },
      );

      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.equal(data.available, true);
    },
  );

  await t.test(
    "returns insufficient_funds for underfunded wallet",
    async (t) => {
      const owner = await createUser("owner@example.com");
      const org = await createOrg("Team", "team");
      await addMember(owner.id, org.id, "owner");

      await db
        .insertInto("wallets")
        .values({
          name: "Empty Wallet",
          organization_id: org.id,
          wallet_config: JSON.stringify({
            type: "solana",
            publicKey: "abc123",
          }),
          funding_status: "pending",
          cached_balances: JSON.stringify({
            solana: { native: "0", usdc: "0" },
            base: { native: "0", usdc: "0" },
            polygon: { native: "0", usdc: "0" },
            monad: { native: "0", usdc: "0" },
          }),
          balances_cached_at: new Date().toISOString(),
        })
        .execute();

      await db
        .insertInto("admin_settings")
        .values({
          minimum_balance_sol: 0.001,
          minimum_balance_usdc: 0.01,
        })
        .execute();

      const res = await app.request(
        `/api/organizations/${org.id}/can-create-proxy`,
        {
          headers: { Cookie: `auth_token=${owner.token}` },
        },
      );

      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.equal(data.available, false);
      t.equal(data.reason, "insufficient_funds");
    },
  );
});

await t.test("GET /api/organizations/:id/onboarding-status", async (t) => {
  await t.test("returns 404 for non-member", async (t) => {
    const user = await createUser("outsider@example.com");
    const org = await createOrg("Team", "team");

    const res = await app.request(
      `/api/organizations/${org.id}/onboarding-status`,
      {
        headers: { Cookie: `auth_token=${user.token}` },
      },
    );

    t.equal(res.status, 404);
  });

  await t.test("returns all steps incomplete for new org", async (t) => {
    const owner = await createUser("owner@example.com");
    const org = await createOrg("Team", "team");
    await addMember(owner.id, org.id, "owner");

    const res = await app.request(
      `/api/organizations/${org.id}/onboarding-status`,
      {
        headers: { Cookie: `auth_token=${owner.token}` },
      },
    );

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.steps.wallet, false);
    t.equal(data.steps.funded, false);
    t.equal(data.steps.proxy, false);
    t.equal(data.steps.endpoint, false);
    t.equal(data.all_steps_complete, false);
  });

  await t.test(
    "returns correct step status with partial progress",
    async (t) => {
      const owner = await createUser("owner@example.com");
      const org = await createOrg("Team", "team");
      await addMember(owner.id, org.id, "owner");

      await db
        .insertInto("wallets")
        .values({
          name: "Wallet",
          organization_id: org.id,
          wallet_config: JSON.stringify({ type: "solana" }),
          funding_status: "funded",
        })
        .execute();

      const res = await app.request(
        `/api/organizations/${org.id}/onboarding-status`,
        {
          headers: { Cookie: `auth_token=${owner.token}` },
        },
      );

      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.equal(data.steps.wallet, true);
      t.equal(data.steps.funded, true);
      t.equal(data.steps.proxy, false);
      t.equal(data.steps.endpoint, false);
      t.equal(data.all_steps_complete, false);
    },
  );

  await t.test(
    "returns all_steps_complete true when fully onboarded",
    async (t) => {
      const owner = await createUser("owner@example.com");
      const org = await createOrg("Team", "team");
      await addMember(owner.id, org.id, "owner");

      await db
        .insertInto("wallets")
        .values({
          name: "Wallet",
          organization_id: org.id,
          wallet_config: JSON.stringify({ type: "solana" }),
          funding_status: "funded",
        })
        .execute();

      const tenant = await db
        .insertInto("tenants")
        .values({
          name: "my-proxy",
          backend_url: "http://backend.com",
          organization_id: org.id,
          default_price_usdc: 0.01,
          default_scheme: "exact",
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      await db
        .insertInto("endpoints")
        .values({
          tenant_id: tenant.id,
          path_pattern: "/*",
          is_active: true,
        })
        .execute();

      const res = await app.request(
        `/api/organizations/${org.id}/onboarding-status`,
        {
          headers: { Cookie: `auth_token=${owner.token}` },
        },
      );

      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.equal(data.steps.wallet, true);
      t.equal(data.steps.funded, true);
      t.equal(data.steps.proxy, true);
      t.equal(data.steps.endpoint, true);
      t.equal(data.all_steps_complete, true);
      t.equal(data.first_proxy_id, tenant.id);
    },
  );
});

await t.test("POST /api/organizations/:id/complete-onboarding", async (t) => {
  await t.test("returns 404 for non-member", async (t) => {
    const user = await createUser("outsider@example.com");
    const org = await createOrg("Team", "team");

    const res = await app.request(
      `/api/organizations/${org.id}/complete-onboarding`,
      {
        method: "POST",
        headers: { Cookie: `auth_token=${user.token}` },
      },
    );

    t.equal(res.status, 404);
  });

  await t.test("returns 400 when steps incomplete", async (t) => {
    const owner = await createUser("owner@example.com");
    const org = await createOrg("Team", "team");
    await addMember(owner.id, org.id, "owner");

    const res = await app.request(
      `/api/organizations/${org.id}/complete-onboarding`,
      {
        method: "POST",
        headers: { Cookie: `auth_token=${owner.token}` },
      },
    );

    t.equal(res.status, 400);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.ok(data.error.includes("onboarding steps"));
  });

  await t.test("completes onboarding when all steps done", async (t) => {
    const owner = await createUser("owner@example.com");
    const org = await createOrg("Team", "team");
    await addMember(owner.id, org.id, "owner");

    await db
      .insertInto("wallets")
      .values({
        name: "Wallet",
        organization_id: org.id,
        wallet_config: JSON.stringify({ type: "solana" }),
        funding_status: "funded",
      })
      .execute();

    const tenant = await db
      .insertInto("tenants")
      .values({
        name: "my-proxy",
        backend_url: "http://backend.com",
        organization_id: org.id,
        default_price_usdc: 0.01,
        default_scheme: "exact",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .insertInto("endpoints")
      .values({
        tenant_id: tenant.id,
        path_pattern: "/*",
        is_active: true,
      })
      .execute();

    const res = await app.request(
      `/api/organizations/${org.id}/complete-onboarding`,
      {
        method: "POST",
        headers: { Cookie: `auth_token=${owner.token}` },
      },
    );

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.success, true);

    const updated = await db
      .selectFrom("organizations")
      .select(["onboarding_completed", "onboarding_completed_at"])
      .where("id", "=", org.id)
      .executeTakeFirstOrThrow();
    t.ok(updated.onboarding_completed);
    t.ok(updated.onboarding_completed_at);
  });
});

await t.test("GET /api/organizations/:id/analytics", async (t) => {
  await t.test("returns 404 for non-member", async (t) => {
    const user = await createUser("outsider@example.com");
    const org = await createOrg("Team", "team");

    const res = await app.request(`/api/organizations/${org.id}/analytics`, {
      headers: { Cookie: `auth_token=${user.token}` },
    });

    t.equal(res.status, 404);
  });
});

await t.test("Admin access tests", async (t) => {
  await t.test("admin can update any org", async (t) => {
    const admin = await createUser("admin@example.com", true);
    const org = await createOrg("Old Name", "old-name");

    const res = await app.request(`/api/organizations/${org.id}`, {
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

  await t.test("admin can delete any org", async (t) => {
    const admin = await createUser("admin@example.com", true);
    const org = await createOrg("To Delete", "to-delete");

    const res = await app.request(`/api/organizations/${org.id}`, {
      method: "DELETE",
      headers: { Cookie: `auth_token=${admin.token}` },
    });

    t.equal(res.status, 200);
  });
});

await t.test("PUT /api/organizations/:id/tenants/:tenantId", async (t) => {
  await t.test("returns 404 for non-member", async (t) => {
    const user = await createUser("outsider@example.com");
    const org = await createOrg("Team", "team");

    const tenant = await db
      .insertInto("tenants")
      .values({
        name: "test-proxy",
        backend_url: "http://backend.com",
        organization_id: org.id,
        default_price_usdc: 0.01,
        default_scheme: "exact",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const res = await app.request(
      `/api/organizations/${org.id}/tenants/${tenant.id}`,
      {
        method: "PUT",
        headers: {
          Cookie: `auth_token=${user.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ backend_url: "http://new-backend.com" }),
      },
    );

    t.equal(res.status, 404);
  });

  await t.test("returns 404 for non-existent tenant", async (t) => {
    const owner = await createUser("owner@example.com");
    const org = await createOrg("Team", "team");
    await addMember(owner.id, org.id, "owner");

    const res = await app.request(`/api/organizations/${org.id}/tenants/9999`, {
      method: "PUT",
      headers: {
        Cookie: `auth_token=${owner.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ backend_url: "http://new-backend.com" }),
    });

    t.equal(res.status, 404);
  });

  await t.test("returns 404 for tenant in wrong org", async (t) => {
    const owner = await createUser("owner@example.com");
    const org1 = await createOrg("Team 1", "team-1");
    const org2 = await createOrg("Team 2", "team-2");
    await addMember(owner.id, org1.id, "owner");

    const tenant = await db
      .insertInto("tenants")
      .values({
        name: "other-proxy",
        backend_url: "http://backend.com",
        organization_id: org2.id,
        default_price_usdc: 0.01,
        default_scheme: "exact",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const res = await app.request(
      `/api/organizations/${org1.id}/tenants/${tenant.id}`,
      {
        method: "PUT",
        headers: {
          Cookie: `auth_token=${owner.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ backend_url: "http://new-backend.com" }),
      },
    );

    t.equal(res.status, 404);
  });

  await t.test("returns 400 for tenant not in active status", async (t) => {
    const owner = await createUser("owner@example.com");
    const org = await createOrg("Team", "team");
    await addMember(owner.id, org.id, "owner");

    const tenant = await db
      .insertInto("tenants")
      .values({
        name: "deleting-proxy",
        backend_url: "http://backend.com",
        organization_id: org.id,
        default_price_usdc: 0.01,
        default_scheme: "exact",
        status: "deleting",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const res = await app.request(
      `/api/organizations/${org.id}/tenants/${tenant.id}`,
      {
        method: "PUT",
        headers: {
          Cookie: `auth_token=${owner.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ backend_url: "http://new-backend.com" }),
      },
    );

    t.equal(res.status, 400);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.ok(data.error.includes("another operation"));
  });

  await t.test("returns 404 for invalid wallet_id", async (t) => {
    const owner = await createUser("owner@example.com");
    const org = await createOrg("Team", "team");
    await addMember(owner.id, org.id, "owner");

    const tenant = await db
      .insertInto("tenants")
      .values({
        name: "test-proxy",
        backend_url: "http://backend.com",
        organization_id: org.id,
        default_price_usdc: 0.01,
        default_scheme: "exact",
        status: "active",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const res = await app.request(
      `/api/organizations/${org.id}/tenants/${tenant.id}`,
      {
        method: "PUT",
        headers: {
          Cookie: `auth_token=${owner.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ wallet_id: 9999 }),
      },
    );

    t.equal(res.status, 404);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.error, "Wallet not found");
  });

  await t.test("returns 404 for wallet in different org", async (t) => {
    const owner = await createUser("owner@example.com");
    const org1 = await createOrg("Team 1", "team-1");
    const org2 = await createOrg("Team 2", "team-2");
    await addMember(owner.id, org1.id, "owner");

    const wallet = await db
      .insertInto("wallets")
      .values({
        name: "Other Wallet",
        organization_id: org2.id,
        wallet_config: JSON.stringify({ type: "solana" }),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const tenant = await db
      .insertInto("tenants")
      .values({
        name: "test-proxy",
        backend_url: "http://backend.com",
        organization_id: org1.id,
        default_price_usdc: 0.01,
        default_scheme: "exact",
        status: "active",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const res = await app.request(
      `/api/organizations/${org1.id}/tenants/${tenant.id}`,
      {
        method: "PUT",
        headers: {
          Cookie: `auth_token=${owner.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ wallet_id: wallet.id }),
      },
    );

    t.equal(res.status, 404);
  });
});

await t.test("DELETE /api/organizations/:id/tenants/:tenantId", async (t) => {
  await t.test("returns 404 for non-member", async (t) => {
    const user = await createUser("outsider@example.com");
    const org = await createOrg("Team", "team");

    const tenant = await db
      .insertInto("tenants")
      .values({
        name: "test-proxy",
        backend_url: "http://backend.com",
        organization_id: org.id,
        default_price_usdc: 0.01,
        default_scheme: "exact",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const res = await app.request(
      `/api/organizations/${org.id}/tenants/${tenant.id}`,
      {
        method: "DELETE",
        headers: { Cookie: `auth_token=${user.token}` },
      },
    );

    t.equal(res.status, 404);
  });

  await t.test("returns 404 for non-existent tenant", async (t) => {
    const owner = await createUser("owner@example.com");
    const org = await createOrg("Team", "team");
    await addMember(owner.id, org.id, "owner");

    const res = await app.request(`/api/organizations/${org.id}/tenants/9999`, {
      method: "DELETE",
      headers: { Cookie: `auth_token=${owner.token}` },
    });

    t.equal(res.status, 404);
  });

  await t.test("returns 404 for tenant in wrong org", async (t) => {
    const owner = await createUser("owner@example.com");
    const org1 = await createOrg("Team 1", "team-1");
    const org2 = await createOrg("Team 2", "team-2");
    await addMember(owner.id, org1.id, "owner");

    const tenant = await db
      .insertInto("tenants")
      .values({
        name: "other-proxy",
        backend_url: "http://backend.com",
        organization_id: org2.id,
        default_price_usdc: 0.01,
        default_scheme: "exact",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const res = await app.request(
      `/api/organizations/${org1.id}/tenants/${tenant.id}`,
      {
        method: "DELETE",
        headers: { Cookie: `auth_token=${owner.token}` },
      },
    );

    t.equal(res.status, 404);
  });

  await t.test("returns 400 for tenant already being deleted", async (t) => {
    const owner = await createUser("owner@example.com");
    const org = await createOrg("Team", "team");
    await addMember(owner.id, org.id, "owner");

    const tenant = await db
      .insertInto("tenants")
      .values({
        name: "deleting-proxy",
        backend_url: "http://backend.com",
        organization_id: org.id,
        default_price_usdc: 0.01,
        default_scheme: "exact",
        status: "deleting",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const res = await app.request(
      `/api/organizations/${org.id}/tenants/${tenant.id}`,
      {
        method: "DELETE",
        headers: { Cookie: `auth_token=${owner.token}` },
      },
    );

    t.equal(res.status, 400);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.ok(data.error.includes("already being deleted"));
  });

  await t.test("returns 400 when cert operation in progress", async (t) => {
    const owner = await createUser("owner@example.com");
    const org = await createOrg("Team", "team");
    await addMember(owner.id, org.id, "owner");

    const tenant = await db
      .insertInto("tenants")
      .values({
        name: "cert-proxy",
        backend_url: "http://backend.com",
        organization_id: org.id,
        default_price_usdc: 0.01,
        default_scheme: "exact",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const node = await db
      .insertInto("nodes")
      .values({
        name: "node1",
        internal_ip: "10.0.0.1",
        status: "active",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .insertInto("tenant_nodes")
      .values({
        tenant_id: tenant.id,
        node_id: node.id,
        is_primary: true,
        cert_status: "pending",
      })
      .execute();

    const res = await app.request(
      `/api/organizations/${org.id}/tenants/${tenant.id}`,
      {
        method: "DELETE",
        headers: { Cookie: `auth_token=${owner.token}` },
      },
    );

    t.equal(res.status, 400);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.ok(data.error.includes("certificate operations"));
  });
});

await t.test("POST /api/organizations/:id/tenants", async (t) => {
  await t.test("returns 404 for non-member", async (t) => {
    const user = await createUser("outsider@example.com");
    const org = await createOrg("Team", "team");

    const wallet = await db
      .insertInto("wallets")
      .values({
        name: "Test Wallet",
        organization_id: org.id,
        wallet_config: JSON.stringify({ type: "solana" }),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const res = await app.request(`/api/organizations/${org.id}/tenants`, {
      method: "POST",
      headers: {
        Cookie: `auth_token=${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "test-proxy",
        backend_url: "http://backend.com",
        wallet_id: wallet.id,
      }),
    });

    t.equal(res.status, 404);
  });

  await t.test("rejects invalid proxy name (sanitizes to empty)", async (t) => {
    const owner = await createUser("owner@example.com");
    const org = await createOrg("Team", "team");
    await addMember(owner.id, org.id, "owner");

    const wallet = await db
      .insertInto("wallets")
      .values({
        name: "Test Wallet",
        organization_id: org.id,
        wallet_config: JSON.stringify({ type: "solana" }),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const res = await app.request(`/api/organizations/${org.id}/tenants`, {
      method: "POST",
      headers: {
        Cookie: `auth_token=${owner.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "!!!",
        backend_url: "http://backend.com",
        wallet_id: wallet.id,
      }),
    });

    t.equal(res.status, 400);
  });

  await t.test("rejects wallet not belonging to organization", async (t) => {
    const owner = await createUser("owner@example.com");
    const org1 = await createOrg("Team 1", "team-1");
    const org2 = await createOrg("Team 2", "team-2");
    await addMember(owner.id, org1.id, "owner");

    const wallet = await db
      .insertInto("wallets")
      .values({
        name: "Other Org Wallet",
        organization_id: org2.id,
        wallet_config: JSON.stringify({ type: "solana" }),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const res = await app.request(`/api/organizations/${org1.id}/tenants`, {
      method: "POST",
      headers: {
        Cookie: `auth_token=${owner.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "test-proxy",
        backend_url: "http://backend.com",
        wallet_id: wallet.id,
      }),
    });

    t.equal(res.status, 400);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.ok(data.error.includes("Wallet not found"));
  });

  await t.test("returns 400 when not enough active nodes", async (t) => {
    const owner = await createUser("owner@example.com");
    const org = await createOrg("Team", "team");
    await addMember(owner.id, org.id, "owner");

    const wallet = await db
      .insertInto("wallets")
      .values({
        name: "Test Wallet",
        organization_id: org.id,
        wallet_config: JSON.stringify({ type: "solana" }),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const res = await app.request(`/api/organizations/${org.id}/tenants`, {
      method: "POST",
      headers: {
        Cookie: `auth_token=${owner.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "test-proxy",
        backend_url: "http://backend.com",
        wallet_id: wallet.id,
      }),
    });

    t.equal(res.status, 400);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.ok(data.error.includes("Not enough active nodes"));
  });

  await t.test("creates tenant with minimal required fields", async (t) => {
    const owner = await createUser("owner@example.com");
    const org = await createOrg("Team", "team");
    await addMember(owner.id, org.id, "owner");

    const wallet = await db
      .insertInto("wallets")
      .values({
        name: "Test Wallet",
        organization_id: org.id,
        wallet_config: JSON.stringify({ type: "solana" }),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .insertInto("nodes")
      .values({
        name: "node1",
        internal_ip: "10.0.0.1",
        public_ip: "1.2.3.4",
        status: "active",
      })
      .execute();

    await db
      .insertInto("nodes")
      .values({
        name: "node2",
        internal_ip: "10.0.0.2",
        public_ip: "2.3.4.5",
        status: "active",
      })
      .execute();

    const res = await app.request(`/api/organizations/${org.id}/tenants`, {
      method: "POST",
      headers: {
        Cookie: `auth_token=${owner.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "my-new-proxy",
        backend_url: "http://backend.com",
        wallet_id: wallet.id,
      }),
    });

    t.equal(res.status, 201);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.name, "my-new-proxy");
    t.equal(data.backend_url, "http://backend.com");
    t.equal(data.default_price_usdc, 0);
    t.equal(data.default_scheme, "exact");
  });

  await t.test("creates tenant with all optional fields", async (t) => {
    const owner = await createUser("owner@example.com");
    const org = await createOrg("Team", "team");
    await addMember(owner.id, org.id, "owner");

    const wallet = await db
      .insertInto("wallets")
      .values({
        name: "Test Wallet",
        organization_id: org.id,
        wallet_config: JSON.stringify({ type: "solana" }),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .insertInto("nodes")
      .values({
        name: "node1",
        internal_ip: "10.0.0.1",
        public_ip: "1.2.3.4",
        status: "active",
      })
      .execute();

    await db
      .insertInto("nodes")
      .values({
        name: "node2",
        internal_ip: "10.0.0.2",
        public_ip: "2.3.4.5",
        status: "active",
      })
      .execute();

    const res = await app.request(`/api/organizations/${org.id}/tenants`, {
      method: "POST",
      headers: {
        Cookie: `auth_token=${owner.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "full-proxy",
        backend_url: "http://backend.com",
        wallet_id: wallet.id,
        default_price_usdc: 0.05,
        default_scheme: "per_request",
        upstream_auth_header: "X-API-Key",
        upstream_auth_value: "secret123",
      }),
    });

    t.equal(res.status, 201);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.default_price_usdc, 0.05);
    t.equal(data.default_scheme, "per_request");
    t.equal(data.upstream_auth_header, "X-API-Key");
    t.equal(data.upstream_auth_value, "secret123");
  });

  await t.test("sanitizes proxy name", async (t) => {
    const owner = await createUser("owner@example.com");
    const org = await createOrg("Team", "team");
    await addMember(owner.id, org.id, "owner");

    const wallet = await db
      .insertInto("wallets")
      .values({
        name: "Test Wallet",
        organization_id: org.id,
        wallet_config: JSON.stringify({ type: "solana" }),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .insertInto("nodes")
      .values({
        name: "node1",
        internal_ip: "10.0.0.1",
        public_ip: "1.2.3.4",
        status: "active",
      })
      .execute();

    await db
      .insertInto("nodes")
      .values({
        name: "node2",
        internal_ip: "10.0.0.2",
        public_ip: "2.3.4.5",
        status: "active",
      })
      .execute();

    const res = await app.request(`/api/organizations/${org.id}/tenants`, {
      method: "POST",
      headers: {
        Cookie: `auth_token=${owner.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "My Proxy Name!",
        backend_url: "http://backend.com",
        wallet_id: wallet.id,
      }),
    });

    t.equal(res.status, 201);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.name, "my-proxy-name");
  });

  await t.test("rejects duplicate tenant name globally", async (t) => {
    const owner = await createUser("owner@example.com");
    const org = await createOrg("Team", "team");
    await addMember(owner.id, org.id, "owner");

    const wallet = await db
      .insertInto("wallets")
      .values({
        name: "Test Wallet",
        organization_id: org.id,
        wallet_config: JSON.stringify({ type: "solana" }),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .insertInto("nodes")
      .values({
        name: "node1",
        internal_ip: "10.0.0.1",
        public_ip: "1.2.3.4",
        status: "active",
      })
      .execute();

    await db
      .insertInto("nodes")
      .values({
        name: "node2",
        internal_ip: "10.0.0.2",
        public_ip: "2.3.4.5",
        status: "active",
      })
      .execute();

    await app.request(`/api/organizations/${org.id}/tenants`, {
      method: "POST",
      headers: {
        Cookie: `auth_token=${owner.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "unique-proxy",
        backend_url: "http://backend.com",
        wallet_id: wallet.id,
        default_price_usdc: 0.01,
        default_scheme: "exact",
      }),
    });

    const res = await app.request(`/api/organizations/${org.id}/tenants`, {
      method: "POST",
      headers: {
        Cookie: `auth_token=${owner.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "unique-proxy",
        backend_url: "http://other.com",
        wallet_id: wallet.id,
        default_price_usdc: 0.01,
        default_scheme: "exact",
      }),
    });

    t.equal(res.status, 409);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.ok(data.error.includes("already exists"));
  });

  await t.test("new proxy has org_slug set from organization", async (t) => {
    const owner = await createUser("owner@example.com");
    const org = await createOrg("Team", "team");
    await addMember(owner.id, org.id, "owner");

    const wallet = await db
      .insertInto("wallets")
      .values({
        name: "Test Wallet",
        organization_id: org.id,
        wallet_config: JSON.stringify({ type: "solana" }),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .insertInto("nodes")
      .values([
        {
          name: "node1",
          internal_ip: "10.0.0.1",
          public_ip: "1.2.3.4",
          status: "active",
        },
        {
          name: "node2",
          internal_ip: "10.0.0.2",
          public_ip: "2.3.4.5",
          status: "active",
        },
      ])
      .execute();

    const res = await app.request(`/api/organizations/${org.id}/tenants`, {
      method: "POST",
      headers: {
        Cookie: `auth_token=${owner.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "new-proxy",
        backend_url: "http://backend.com",
        wallet_id: wallet.id,
      }),
    });

    t.equal(res.status, 201);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.org_slug, "team");
  });

  await t.test(
    "allows same name as org_slug proxy in different org",
    async (t) => {
      const owner = await createUser("owner@example.com");
      const org1 = await createOrg("Team One", "team-one");
      const org2 = await createOrg("Team Two", "team-two");
      await addMember(owner.id, org1.id, "owner");
      await addMember(owner.id, org2.id, "owner");

      const wallet1 = await db
        .insertInto("wallets")
        .values({
          name: "Wallet 1",
          organization_id: org1.id,
          wallet_config: JSON.stringify({ type: "solana" }),
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      const wallet2 = await db
        .insertInto("wallets")
        .values({
          name: "Wallet 2",
          organization_id: org2.id,
          wallet_config: JSON.stringify({ type: "solana" }),
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      await db
        .insertInto("nodes")
        .values([
          {
            name: "node1",
            internal_ip: "10.0.0.1",
            public_ip: "1.2.3.4",
            status: "active",
          },
          {
            name: "node2",
            internal_ip: "10.0.0.2",
            public_ip: "2.3.4.5",
            status: "active",
          },
        ])
        .execute();

      // Create proxy in org1
      const res1 = await app.request(`/api/organizations/${org1.id}/tenants`, {
        method: "POST",
        headers: {
          Cookie: `auth_token=${owner.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "shared-api",
          backend_url: "http://backend1.com",
          wallet_id: wallet1.id,
        }),
      });
      t.equal(res1.status, 201);

      // Create proxy with same name in org2
      const res2 = await app.request(`/api/organizations/${org2.id}/tenants`, {
        method: "POST",
        headers: {
          Cookie: `auth_token=${owner.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "shared-api",
          backend_url: "http://backend2.com",
          wallet_id: wallet2.id,
        }),
      });
      t.equal(res2.status, 201);
    },
  );

  await t.test(
    "rejects same name as existing org_slug proxy in same org",
    async (t) => {
      const owner = await createUser("owner@example.com");
      const org = await createOrg("Team", "team");
      await addMember(owner.id, org.id, "owner");

      const wallet = await db
        .insertInto("wallets")
        .values({
          name: "Test Wallet",
          organization_id: org.id,
          wallet_config: JSON.stringify({ type: "solana" }),
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      await db
        .insertInto("nodes")
        .values([
          {
            name: "node1",
            internal_ip: "10.0.0.1",
            public_ip: "1.2.3.4",
            status: "active",
          },
          {
            name: "node2",
            internal_ip: "10.0.0.2",
            public_ip: "2.3.4.5",
            status: "active",
          },
        ])
        .execute();

      // Create first proxy
      const res1 = await app.request(`/api/organizations/${org.id}/tenants`, {
        method: "POST",
        headers: {
          Cookie: `auth_token=${owner.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "my-api",
          backend_url: "http://backend.com",
          wallet_id: wallet.id,
        }),
      });
      t.equal(res1.status, 201);

      // Try to create duplicate in same org
      const res2 = await app.request(`/api/organizations/${org.id}/tenants`, {
        method: "POST",
        headers: {
          Cookie: `auth_token=${owner.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "my-api",
          backend_url: "http://backend2.com",
          wallet_id: wallet.id,
        }),
      });
      t.equal(res2.status, 409);
    },
  );
});

await t.test(
  "GET /api/organizations/:id/tenants/:tenantId/analytics",
  async (t) => {
    await t.test("returns 404 for non-member", async (t) => {
      const user = await createUser("outsider@example.com");
      const org = await createOrg("Team", "team");

      const tenant = await db
        .insertInto("tenants")
        .values({
          name: "test-proxy",
          backend_url: "http://backend.com",
          organization_id: org.id,
          default_price_usdc: 0.01,
          default_scheme: "exact",
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      const res = await app.request(
        `/api/organizations/${org.id}/tenants/${tenant.id}/analytics`,
        { headers: { Cookie: `auth_token=${user.token}` } },
      );

      t.equal(res.status, 404);
    });

    await t.test("returns 404 for tenant not in org", async (t) => {
      const owner = await createUser("owner@example.com");
      const org1 = await createOrg("Team 1", "team-1");
      const org2 = await createOrg("Team 2", "team-2");
      await addMember(owner.id, org1.id, "owner");

      const tenant = await db
        .insertInto("tenants")
        .values({
          name: "other-proxy",
          backend_url: "http://backend.com",
          organization_id: org2.id,
          default_price_usdc: 0.01,
          default_scheme: "exact",
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      const res = await app.request(
        `/api/organizations/${org1.id}/tenants/${tenant.id}/analytics`,
        { headers: { Cookie: `auth_token=${owner.token}` } },
      );

      t.equal(res.status, 404);
    });

    await t.test("returns analytics for member", async (t) => {
      const owner = await createUser("owner@example.com");
      const org = await createOrg("Team", "team");
      await addMember(owner.id, org.id, "owner");

      const tenant = await db
        .insertInto("tenants")
        .values({
          name: "test-proxy",
          backend_url: "http://backend.com",
          organization_id: org.id,
          default_price_usdc: 0.01,
          default_scheme: "exact",
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      const res = await app.request(
        `/api/organizations/${org.id}/tenants/${tenant.id}/analytics`,
        { headers: { Cookie: `auth_token=${owner.token}` } },
      );

      t.equal(res.status, 200);
    });
  },
);

await t.test(
  "GET /api/organizations/:id/tenants/:tenantId/endpoints/:endpointId/analytics",
  async (t) => {
    await t.test("returns 404 for non-member", async (t) => {
      const user = await createUser("outsider@example.com");
      const org = await createOrg("Team", "team");

      const tenant = await db
        .insertInto("tenants")
        .values({
          name: "test-proxy",
          backend_url: "http://backend.com",
          organization_id: org.id,
          default_price_usdc: 0.01,
          default_scheme: "exact",
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      const endpoint = await db
        .insertInto("endpoints")
        .values({
          tenant_id: tenant.id,
          path_pattern: "^/api/.*$",
          is_active: true,
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      const res = await app.request(
        `/api/organizations/${org.id}/tenants/${tenant.id}/endpoints/${endpoint.id}/analytics`,
        { headers: { Cookie: `auth_token=${user.token}` } },
      );

      t.equal(res.status, 404);
    });

    await t.test("returns 404 for endpoint not in tenant", async (t) => {
      const owner = await createUser("owner@example.com");
      const org = await createOrg("Team", "team");
      await addMember(owner.id, org.id, "owner");

      const tenant1 = await db
        .insertInto("tenants")
        .values({
          name: "tenant-1",
          backend_url: "http://backend.com",
          organization_id: org.id,
          default_price_usdc: 0.01,
          default_scheme: "exact",
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      const tenant2 = await db
        .insertInto("tenants")
        .values({
          name: "tenant-2",
          backend_url: "http://backend.com",
          organization_id: org.id,
          default_price_usdc: 0.01,
          default_scheme: "exact",
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      const endpoint = await db
        .insertInto("endpoints")
        .values({
          tenant_id: tenant2.id,
          path_pattern: "^/api/.*$",
          is_active: true,
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      const res = await app.request(
        `/api/organizations/${org.id}/tenants/${tenant1.id}/endpoints/${endpoint.id}/analytics`,
        { headers: { Cookie: `auth_token=${owner.token}` } },
      );

      t.equal(res.status, 404);
    });

    await t.test("returns analytics for valid endpoint", async (t) => {
      const owner = await createUser("owner@example.com");
      const org = await createOrg("Team", "team");
      await addMember(owner.id, org.id, "owner");

      const tenant = await db
        .insertInto("tenants")
        .values({
          name: "test-proxy",
          backend_url: "http://backend.com",
          organization_id: org.id,
          default_price_usdc: 0.01,
          default_scheme: "exact",
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      const endpoint = await db
        .insertInto("endpoints")
        .values({
          tenant_id: tenant.id,
          path_pattern: "^/api/.*$",
          is_active: true,
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      const res = await app.request(
        `/api/organizations/${org.id}/tenants/${tenant.id}/endpoints/${endpoint.id}/analytics`,
        { headers: { Cookie: `auth_token=${owner.token}` } },
      );

      t.equal(res.status, 200);
    });
  },
);

await t.test(
  "GET /api/organizations/:id/tenants/:tenantId/catch-all/analytics",
  async (t) => {
    await t.test("returns 404 for non-member", async (t) => {
      const user = await createUser("outsider@example.com");
      const org = await createOrg("Team", "team");

      const tenant = await db
        .insertInto("tenants")
        .values({
          name: "test-proxy",
          backend_url: "http://backend.com",
          organization_id: org.id,
          default_price_usdc: 0.01,
          default_scheme: "exact",
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      const res = await app.request(
        `/api/organizations/${org.id}/tenants/${tenant.id}/catch-all/analytics`,
        { headers: { Cookie: `auth_token=${user.token}` } },
      );

      t.equal(res.status, 404);
    });

    await t.test("returns 404 for tenant not in org", async (t) => {
      const owner = await createUser("owner@example.com");
      const org1 = await createOrg("Team 1", "team-1");
      const org2 = await createOrg("Team 2", "team-2");
      await addMember(owner.id, org1.id, "owner");

      const tenant = await db
        .insertInto("tenants")
        .values({
          name: "other-proxy",
          backend_url: "http://backend.com",
          organization_id: org2.id,
          default_price_usdc: 0.01,
          default_scheme: "exact",
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      const res = await app.request(
        `/api/organizations/${org1.id}/tenants/${tenant.id}/catch-all/analytics`,
        { headers: { Cookie: `auth_token=${owner.token}` } },
      );

      t.equal(res.status, 404);
    });

    await t.test("returns analytics for member", async (t) => {
      const owner = await createUser("owner@example.com");
      const org = await createOrg("Team", "team");
      await addMember(owner.id, org.id, "owner");

      const tenant = await db
        .insertInto("tenants")
        .values({
          name: "test-proxy",
          backend_url: "http://backend.com",
          organization_id: org.id,
          default_price_usdc: 0.01,
          default_scheme: "exact",
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      const res = await app.request(
        `/api/organizations/${org.id}/tenants/${tenant.id}/catch-all/analytics`,
        { headers: { Cookie: `auth_token=${owner.token}` } },
      );

      t.equal(res.status, 200);
    });
  },
);

await t.test("GET /api/organizations/:id/analytics/earnings", async (t) => {
  await t.test("returns 404 for non-member", async (t) => {
    const user = await createUser("outsider@example.com");
    const org = await createOrg("Team", "team");

    const res = await app.request(
      `/api/organizations/${org.id}/analytics/earnings?level=organization`,
      { headers: { Cookie: `auth_token=${user.token}` } },
    );

    t.equal(res.status, 404);
  });

  await t.test("returns 400 for invalid level", async (t) => {
    const owner = await createUser("owner@example.com");
    const org = await createOrg("Team", "team");
    await addMember(owner.id, org.id, "owner");

    const res = await app.request(
      `/api/organizations/${org.id}/analytics/earnings?level=invalid`,
      { headers: { Cookie: `auth_token=${owner.token}` } },
    );

    t.equal(res.status, 400);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.ok(data.error.includes("Invalid level"));
  });

  await t.test("returns 400 for invalid granularity", async (t) => {
    const owner = await createUser("owner@example.com");
    const org = await createOrg("Team", "team");
    await addMember(owner.id, org.id, "owner");

    const res = await app.request(
      `/api/organizations/${org.id}/analytics/earnings?level=organization&granularity=invalid`,
      { headers: { Cookie: `auth_token=${owner.token}` } },
    );

    t.equal(res.status, 400);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.ok(data.error.includes("Invalid granularity"));
  });

  await t.test("returns 400 for tenant level without targetId", async (t) => {
    const owner = await createUser("owner@example.com");
    const org = await createOrg("Team", "team");
    await addMember(owner.id, org.id, "owner");

    const res = await app.request(
      `/api/organizations/${org.id}/analytics/earnings?level=tenant`,
      { headers: { Cookie: `auth_token=${owner.token}` } },
    );

    t.equal(res.status, 400);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.ok(data.error.includes("targetId is required"));
  });

  await t.test("returns 400 for invalid targetId", async (t) => {
    const owner = await createUser("owner@example.com");
    const org = await createOrg("Team", "team");
    await addMember(owner.id, org.id, "owner");

    const res = await app.request(
      `/api/organizations/${org.id}/analytics/earnings?level=tenant&targetId=invalid`,
      { headers: { Cookie: `auth_token=${owner.token}` } },
    );

    t.equal(res.status, 400);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.ok(data.error.includes("Invalid targetId"));
  });

  await t.test("returns 404 for tenant not in org", async (t) => {
    const owner = await createUser("owner@example.com");
    const org1 = await createOrg("Team 1", "team-1");
    const org2 = await createOrg("Team 2", "team-2");
    await addMember(owner.id, org1.id, "owner");

    const tenant = await db
      .insertInto("tenants")
      .values({
        name: "other-proxy",
        backend_url: "http://backend.com",
        organization_id: org2.id,
        default_price_usdc: 0.01,
        default_scheme: "exact",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const res = await app.request(
      `/api/organizations/${org1.id}/analytics/earnings?level=tenant&targetId=${tenant.id}`,
      { headers: { Cookie: `auth_token=${owner.token}` } },
    );

    t.equal(res.status, 404);
  });

  await t.test("returns 404 for endpoint not in org", async (t) => {
    const owner = await createUser("owner@example.com");
    const org1 = await createOrg("Team 1", "team-1");
    const org2 = await createOrg("Team 2", "team-2");
    await addMember(owner.id, org1.id, "owner");

    const tenant = await db
      .insertInto("tenants")
      .values({
        name: "other-proxy",
        backend_url: "http://backend.com",
        organization_id: org2.id,
        default_price_usdc: 0.01,
        default_scheme: "exact",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const endpoint = await db
      .insertInto("endpoints")
      .values({
        tenant_id: tenant.id,
        path_pattern: "^/api/.*$",
        is_active: true,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const res = await app.request(
      `/api/organizations/${org1.id}/analytics/earnings?level=endpoint&targetId=${endpoint.id}`,
      { headers: { Cookie: `auth_token=${owner.token}` } },
    );

    t.equal(res.status, 404);
  });

  await t.test("returns 400 for invalid periods", async (t) => {
    const owner = await createUser("owner@example.com");
    const org = await createOrg("Team", "team");
    await addMember(owner.id, org.id, "owner");

    const res = await app.request(
      `/api/organizations/${org.id}/analytics/earnings?level=organization&periods=500`,
      { headers: { Cookie: `auth_token=${owner.token}` } },
    );

    t.equal(res.status, 400);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.ok(data.error.includes("Invalid periods"));
  });

  await t.test("passes validation for organization level", async (t) => {
    const owner = await createUser("owner@example.com");
    const org = await createOrg("Team", "team");
    await addMember(owner.id, org.id, "owner");

    const res = await app.request(
      `/api/organizations/${org.id}/analytics/earnings?level=organization`,
      { headers: { Cookie: `auth_token=${owner.token}` } },
    );

    t.equal(res.status, 200);
  });

  await t.test("passes validation for tenant level", async (t) => {
    const owner = await createUser("owner@example.com");
    const org = await createOrg("Team", "team");
    await addMember(owner.id, org.id, "owner");

    const tenant = await db
      .insertInto("tenants")
      .values({
        name: "test-proxy",
        backend_url: "http://backend.com",
        organization_id: org.id,
        default_price_usdc: 0.01,
        default_scheme: "exact",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const res = await app.request(
      `/api/organizations/${org.id}/analytics/earnings?level=tenant&targetId=${tenant.id}`,
      { headers: { Cookie: `auth_token=${owner.token}` } },
    );

    t.equal(res.status, 200);
  });

  await t.test("passes validation for endpoint level", async (t) => {
    const owner = await createUser("owner@example.com");
    const org = await createOrg("Team", "team");
    await addMember(owner.id, org.id, "owner");

    const tenant = await db
      .insertInto("tenants")
      .values({
        name: "test-proxy",
        backend_url: "http://backend.com",
        organization_id: org.id,
        default_price_usdc: 0.01,
        default_scheme: "exact",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const endpoint = await db
      .insertInto("endpoints")
      .values({
        tenant_id: tenant.id,
        path_pattern: "^/api/.*$",
        is_active: true,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const res = await app.request(
      `/api/organizations/${org.id}/analytics/earnings?level=endpoint&targetId=${endpoint.id}`,
      { headers: { Cookie: `auth_token=${owner.token}` } },
    );

    t.equal(res.status, 200);
  });

  await t.test("accepts different granularities", async (t) => {
    const owner = await createUser("owner@example.com");
    const org = await createOrg("Team", "team");
    await addMember(owner.id, org.id, "owner");

    for (const granularity of ["day", "week", "month"]) {
      const res = await app.request(
        `/api/organizations/${org.id}/analytics/earnings?level=organization&granularity=${granularity}`,
        { headers: { Cookie: `auth_token=${owner.token}` } },
      );

      t.equal(res.status, 200, `should accept granularity=${granularity}`);
    }
  });
});

await t.test("Admin bypass - access non-member org", async (t) => {
  await t.test("admin can view org they are not a member of", async (t) => {
    const admin = await createUser("admin@example.com", true);
    const otherUser = await createUser("other@example.com");
    const org = await createOrg("Other Team", "other-team");
    await addMember(otherUser.id, org.id, "owner");

    const res = await app.request(`/api/organizations/${org.id}`, {
      headers: { Cookie: `auth_token=${admin.token}` },
    });

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.name, "Other Team");
  });

  await t.test("admin can view members of org they are not in", async (t) => {
    const admin = await createUser("admin@example.com", true);
    const otherUser = await createUser("other@example.com");
    const org = await createOrg("Other Team", "other-team");
    await addMember(otherUser.id, org.id, "owner");

    const res = await app.request(`/api/organizations/${org.id}/members`, {
      headers: { Cookie: `auth_token=${admin.token}` },
    });

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.length, 1);
    t.equal(data[0].email, "other@example.com");
  });

  await t.test("admin can view tenants of org they are not in", async (t) => {
    const admin = await createUser("admin@example.com", true);
    const otherUser = await createUser("other@example.com");
    const org = await createOrg("Other Team", "other-team");
    await addMember(otherUser.id, org.id, "owner");

    await db
      .insertInto("tenants")
      .values({
        name: "other-proxy",
        backend_url: "http://backend.com",
        organization_id: org.id,
        default_price_usdc: 0.01,
        default_scheme: "exact",
      })
      .execute();

    const res = await app.request(`/api/organizations/${org.id}/tenants`, {
      headers: { Cookie: `auth_token=${admin.token}` },
    });

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.length, 1);
    t.equal(data[0].name, "other-proxy");
  });
});

await t.test("DELETE /api/organizations/:id - cascade behavior", async (t) => {
  await t.test(
    "deleting org sets tenants organization_id to null",
    async (t) => {
      const owner = await createUser("owner@example.com");
      const org = await createOrg("Team", "team");
      await addMember(owner.id, org.id, "owner");

      const tenant = await db
        .insertInto("tenants")
        .values({
          name: "my-proxy",
          backend_url: "http://backend.com",
          organization_id: org.id,
          default_price_usdc: 0.01,
          default_scheme: "exact",
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      const res = await app.request(`/api/organizations/${org.id}`, {
        method: "DELETE",
        headers: { Cookie: `auth_token=${owner.token}` },
      });

      t.equal(res.status, 200);

      // Tenant persists but organization_id is set to null (onDelete: set null)
      const tenantCheck = await db
        .selectFrom("tenants")
        .select(["id", "organization_id"])
        .where("id", "=", tenant.id)
        .executeTakeFirst();

      t.ok(tenantCheck, "tenant should still exist");
      t.equal(
        tenantCheck?.organization_id,
        null,
        "organization_id should be null",
      );
    },
  );

  await t.test("deleting org removes members", async (t) => {
    const owner = await createUser("owner@example.com");
    const member = await createUser("member@example.com");
    const org = await createOrg("Team", "team");
    await addMember(owner.id, org.id, "owner");
    await addMember(member.id, org.id, "member");

    const res = await app.request(`/api/organizations/${org.id}`, {
      method: "DELETE",
      headers: { Cookie: `auth_token=${owner.token}` },
    });

    t.equal(res.status, 200);

    // Verify memberships were deleted (cascade)
    const membershipCheck = await db
      .selectFrom("user_organizations")
      .select("id")
      .where("organization_id", "=", org.id)
      .execute();

    t.equal(membershipCheck.length, 0);
  });
});
