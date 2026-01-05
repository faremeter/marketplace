import "../tests/setup/env.js";
import t from "tap";
import { Hono } from "hono";
import { db, setupTestSchema, clearTestData } from "../db/instance.js";
import { signToken } from "../middleware/auth.js";
import { publicRoutes } from "./public.js";

const app = new Hono();
app.route("/api", publicRoutes);

await setupTestSchema();

t.beforeEach(async () => {
  await clearTestData();
});

await t.test("POST /api/waitlist", async (t) => {
  await t.test("adds email to waitlist", async (t) => {
    const res = await app.request("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com" }),
    });

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.same(data, { success: true });

    const entry = await db
      .selectFrom("waitlist")
      .select("email")
      .where("email", "=", "test@example.com")
      .executeTakeFirst();
    t.ok(entry);
  });

  await t.test("normalizes email case", async (t) => {
    const res = await app.request("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "TEST@EXAMPLE.COM" }),
    });

    t.equal(res.status, 200);

    const entry = await db
      .selectFrom("waitlist")
      .select("email")
      .where("email", "=", "test@example.com")
      .executeTakeFirst();
    t.ok(entry);
  });

  await t.test("handles duplicate email gracefully", async (t) => {
    await db
      .insertInto("waitlist")
      .values({ email: "dup@example.com" })
      .execute();

    const res = await app.request("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "dup@example.com" }),
    });

    t.equal(res.status, 200);
  });

  await t.test("rejects invalid email", async (t) => {
    const res = await app.request("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-an-email" }),
    });

    t.equal(res.status, 400);
  });
});

await t.test("GET /api/invitations/:token", async (t) => {
  await t.test("returns 404 for non-existent invitation", async (t) => {
    const res = await app.request("/api/invitations/nonexistent");
    t.equal(res.status, 404);
  });

  await t.test("returns invitation details", async (t) => {
    const org = await db
      .insertInto("organizations")
      .values({ name: "Test Org", slug: "test-org" })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .insertInto("organization_invitations")
      .values({
        organization_id: org.id,
        email: "invited@example.com",
        token: "test-token-123",
        role: "member",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      })
      .execute();

    const res = await app.request("/api/invitations/test-token-123");
    t.equal(res.status, 200);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.email, "invited@example.com");
    t.equal(data.organization_name, "Test Org");
  });

  await t.test("returns 410 for expired invitation", async (t) => {
    const org = await db
      .insertInto("organizations")
      .values({ name: "Test Org 2", slug: "test-org-2" })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .insertInto("organization_invitations")
      .values({
        organization_id: org.id,
        email: "expired@example.com",
        token: "expired-token",
        role: "member",
        expires_at: new Date(Date.now() - 86400000).toISOString(),
      })
      .execute();

    const res = await app.request("/api/invitations/expired-token");
    t.equal(res.status, 410);
  });

  await t.test("returns 410 for already accepted invitation", async (t) => {
    const org = await db
      .insertInto("organizations")
      .values({ name: "Test Org 3", slug: "test-org-3" })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .insertInto("organization_invitations")
      .values({
        organization_id: org.id,
        email: "accepted@example.com",
        token: "accepted-token",
        role: "member",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        accepted_at: new Date().toISOString(),
      })
      .execute();

    const res = await app.request("/api/invitations/accepted-token");
    t.equal(res.status, 410);
  });
});

await t.test("GET /api/invitations/:token with auth", async (t) => {
  await t.test("shows emailMatch true when emails match", async (t) => {
    const org = await db
      .insertInto("organizations")
      .values({ name: "Match Org", slug: "match-org" })
      .returning("id")
      .executeTakeFirstOrThrow();

    const user = await db
      .insertInto("users")
      .values({ email: "match@example.com", password_hash: "hash" })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .insertInto("organization_invitations")
      .values({
        organization_id: org.id,
        email: "match@example.com",
        token: "match-token",
        role: "member",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      })
      .execute();

    const token = signToken({
      userId: user.id,
      email: "match@example.com",
      isAdmin: false,
    });
    const res = await app.request("/api/invitations/match-token", {
      headers: { Cookie: `auth_token=${token}` },
    });

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.emailMatch, true);
    t.equal(data.currentUserEmail, "match@example.com");
  });

  await t.test("shows emailMatch false when emails differ", async (t) => {
    const org = await db
      .insertInto("organizations")
      .values({ name: "Diff Org", slug: "diff-org" })
      .returning("id")
      .executeTakeFirstOrThrow();

    const user = await db
      .insertInto("users")
      .values({ email: "other@example.com", password_hash: "hash" })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .insertInto("organization_invitations")
      .values({
        organization_id: org.id,
        email: "invited@example.com",
        token: "diff-token",
        role: "member",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      })
      .execute();

    const token = signToken({
      userId: user.id,
      email: "other@example.com",
      isAdmin: false,
    });
    const res = await app.request("/api/invitations/diff-token", {
      headers: { Cookie: `auth_token=${token}` },
    });

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.emailMatch, false);
  });
});

await t.test("POST /api/invitations/:token/accept", async (t) => {
  await t.test("returns 401 without auth", async (t) => {
    const res = await app.request("/api/invitations/some-token/accept", {
      method: "POST",
    });
    t.equal(res.status, 401);
  });

  await t.test("returns 404 for non-existent invitation", async (t) => {
    const user = await db
      .insertInto("users")
      .values({ email: "user404@example.com", password_hash: "hash" })
      .returning("id")
      .executeTakeFirstOrThrow();

    const token = signToken({
      userId: user.id,
      email: "user404@example.com",
      isAdmin: false,
    });
    const res = await app.request("/api/invitations/nonexistent/accept", {
      method: "POST",
      headers: { Cookie: `auth_token=${token}` },
    });

    t.equal(res.status, 404);
  });

  await t.test("returns 410 for expired invitation", async (t) => {
    const org = await db
      .insertInto("organizations")
      .values({ name: "Expired Org", slug: "expired-org-accept" })
      .returning("id")
      .executeTakeFirstOrThrow();

    const user = await db
      .insertInto("users")
      .values({ email: "expired@example.com", password_hash: "hash" })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .insertInto("organization_invitations")
      .values({
        organization_id: org.id,
        email: "expired@example.com",
        token: "expired-accept-token",
        role: "member",
        expires_at: new Date(Date.now() - 86400000).toISOString(),
      })
      .execute();

    const token = signToken({
      userId: user.id,
      email: "expired@example.com",
      isAdmin: false,
    });
    const res = await app.request(
      "/api/invitations/expired-accept-token/accept",
      {
        method: "POST",
        headers: { Cookie: `auth_token=${token}` },
      },
    );

    t.equal(res.status, 410);
  });

  await t.test("returns 410 for already accepted invitation", async (t) => {
    const org = await db
      .insertInto("organizations")
      .values({ name: "Already Org", slug: "already-org" })
      .returning("id")
      .executeTakeFirstOrThrow();

    const user = await db
      .insertInto("users")
      .values({ email: "already@example.com", password_hash: "hash" })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .insertInto("organization_invitations")
      .values({
        organization_id: org.id,
        email: "already@example.com",
        token: "already-accepted-token",
        role: "member",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        accepted_at: new Date().toISOString(),
      })
      .execute();

    const token = signToken({
      userId: user.id,
      email: "already@example.com",
      isAdmin: false,
    });
    const res = await app.request(
      "/api/invitations/already-accepted-token/accept",
      {
        method: "POST",
        headers: { Cookie: `auth_token=${token}` },
      },
    );

    t.equal(res.status, 410);
  });

  await t.test("returns 409 if already a member", async (t) => {
    const org = await db
      .insertInto("organizations")
      .values({ name: "Member Org", slug: "member-org" })
      .returning("id")
      .executeTakeFirstOrThrow();

    const user = await db
      .insertInto("users")
      .values({ email: "member@example.com", password_hash: "hash" })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .insertInto("user_organizations")
      .values({
        user_id: user.id,
        organization_id: org.id,
        role: "member",
      })
      .execute();

    await db
      .insertInto("organization_invitations")
      .values({
        organization_id: org.id,
        email: "member@example.com",
        token: "member-token",
        role: "admin",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      })
      .execute();

    const token = signToken({
      userId: user.id,
      email: "member@example.com",
      isAdmin: false,
    });
    const res = await app.request("/api/invitations/member-token/accept", {
      method: "POST",
      headers: { Cookie: `auth_token=${token}` },
    });

    t.equal(res.status, 409);
  });

  await t.test("accepts invitation for matching user", async (t) => {
    const org = await db
      .insertInto("organizations")
      .values({ name: "Join Org", slug: "join-org" })
      .returning("id")
      .executeTakeFirstOrThrow();

    const user = await db
      .insertInto("users")
      .values({
        email: "joiner@example.com",
        password_hash: "hash",
        email_verified: true,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .insertInto("organization_invitations")
      .values({
        organization_id: org.id,
        email: "joiner@example.com",
        token: "join-token",
        role: "member",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      })
      .execute();

    const token = signToken({
      userId: user.id,
      email: "joiner@example.com",
      isAdmin: false,
    });

    const res = await app.request("/api/invitations/join-token/accept", {
      method: "POST",
      headers: { Cookie: `auth_token=${token}` },
    });

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.success, true);
    t.equal(data.organization.name, "Join Org");

    const membership = await db
      .selectFrom("user_organizations")
      .selectAll()
      .where("user_id", "=", user.id)
      .where("organization_id", "=", org.id)
      .executeTakeFirst();
    t.ok(membership);
    t.equal(membership?.role, "member");
  });

  await t.test("rejects if email does not match", async (t) => {
    const org = await db
      .insertInto("organizations")
      .values({ name: "Mismatch Org", slug: "mismatch-org" })
      .returning("id")
      .executeTakeFirstOrThrow();

    const user = await db
      .insertInto("users")
      .values({
        email: "wrong@example.com",
        password_hash: "hash",
        email_verified: true,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .insertInto("organization_invitations")
      .values({
        organization_id: org.id,
        email: "correct@example.com",
        token: "mismatch-token",
        role: "member",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      })
      .execute();

    const token = signToken({
      userId: user.id,
      email: "wrong@example.com",
      isAdmin: false,
    });

    const res = await app.request("/api/invitations/mismatch-token/accept", {
      method: "POST",
      headers: { Cookie: `auth_token=${token}` },
    });

    t.equal(res.status, 403);
  });
});
