import "../tests/setup/env.js";
import t from "tap";
import { Hono } from "hono";
import bcrypt from "bcrypt";
import { db, setupTestSchema, clearTestData } from "../db/instance.js";
import { signToken } from "../middleware/auth.js";
import { authRoutes } from "./auth.js";

const app = new Hono();
app.route("/api/auth", authRoutes);

await setupTestSchema();

t.beforeEach(async () => {
  await clearTestData();
});

await t.test("POST /api/auth/signup", async (t) => {
  await t.test("creates user and returns 201", async (t) => {
    const res = await app.request("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "new@example.com",
        password: "password123",
      }),
    });

    t.equal(res.status, 201);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.ok(data.user);
    t.equal(data.user.email, "new@example.com");
    t.ok(data.user.organizations);
    t.equal(data.user.organizations.length, 1);
    t.equal(data.user.organizations[0].role, "owner");
    t.ok(data.verification_token);

    const cookie = res.headers.get("set-cookie");
    t.ok(cookie?.includes("auth_token="));
  });

  await t.test("returns 409 for duplicate email", async (t) => {
    await db
      .insertInto("users")
      .values({
        email: "existing@example.com",
        password_hash: "hash",
      })
      .execute();

    const res = await app.request("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "existing@example.com",
        password: "password123",
      }),
    });

    t.equal(res.status, 409);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.error, "Email already registered");
  });

  await t.test("normalizes email case", async (t) => {
    const res = await app.request("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "UPPER@EXAMPLE.COM",
        password: "password123",
      }),
    });

    t.equal(res.status, 201);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.user.email, "upper@example.com");
  });

  await t.test("rejects invalid email", async (t) => {
    const res = await app.request("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-an-email", password: "password123" }),
    });

    t.equal(res.status, 400);
  });

  await t.test("rejects short password", async (t) => {
    const res = await app.request("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", password: "short" }),
    });

    t.equal(res.status, 400);
  });

  await t.test("accepts password with special characters", async (t) => {
    const res = await app.request("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "special@example.com",
        password: "P@ssw0rd!#$%^&*()",
      }),
    });

    t.equal(res.status, 201);
  });

  await t.test("accepts password with unicode characters", async (t) => {
    const res = await app.request("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "unicode@example.com",
        password: "password123",
      }),
    });

    t.equal(res.status, 201);
  });

  await t.test("accepts password with spaces", async (t) => {
    const res = await app.request("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "spaces@example.com",
        password: "my secret passphrase",
      }),
    });

    t.equal(res.status, 201);
  });

  await t.test(
    "returns 403 in production for non-waitlisted user",
    async (t) => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      try {
        const res = await app.request("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "not-on-waitlist@example.com",
            password: "password123",
          }),
        });

        t.equal(res.status, 403);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = (await res.json()) as any;
        t.ok(data.error.includes("waitlist"));
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    },
  );

  await t.test(
    "allows signup in production for whitelisted user",
    async (t) => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      try {
        await db
          .insertInto("waitlist")
          .values({ email: "whitelisted@example.com", whitelisted: true })
          .execute();

        const res = await app.request("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "whitelisted@example.com",
            password: "password123",
          }),
        });

        t.equal(res.status, 201);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = (await res.json()) as any;
        t.equal(data.user.email, "whitelisted@example.com");
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    },
  );

  await t.test(
    "returns 403 for waitlisted but not whitelisted user",
    async (t) => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      try {
        await db
          .insertInto("waitlist")
          .values({ email: "not-whitelisted@example.com", whitelisted: false })
          .execute();

        const res = await app.request("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "not-whitelisted@example.com",
            password: "password123",
          }),
        });

        t.equal(res.status, 403);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    },
  );
});

await t.test("POST /api/auth/login", async (t) => {
  await t.test("returns user and sets cookie on success", async (t) => {
    const passwordHash = await bcrypt.hash("correctpassword", 10);
    const user = await db
      .insertInto("users")
      .values({
        email: "login@example.com",
        password_hash: passwordHash,
        email_verified: true,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const org = await db
      .insertInto("organizations")
      .values({
        name: "Test Org",
        slug: "test-org",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .insertInto("user_organizations")
      .values({
        user_id: user.id,
        organization_id: org.id,
        role: "owner",
      })
      .execute();

    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "login@example.com",
        password: "correctpassword",
      }),
    });

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.user.email, "login@example.com");
    t.ok(data.user.organizations);
    t.equal(data.user.organizations.length, 1);

    const cookie = res.headers.get("set-cookie");
    t.ok(cookie?.includes("auth_token="));
  });

  await t.test("returns 401 for wrong password", async (t) => {
    const passwordHash = await bcrypt.hash("correctpassword", 10);
    await db
      .insertInto("users")
      .values({
        email: "wrongpw@example.com",
        password_hash: passwordHash,
      })
      .execute();

    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "wrongpw@example.com",
        password: "wrongpassword",
      }),
    });

    t.equal(res.status, 401);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.error, "Invalid email or password");
  });

  await t.test("returns 401 for nonexistent user", async (t) => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "nobody@example.com",
        password: "password123",
      }),
    });

    t.equal(res.status, 401);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.error, "Invalid email or password");
  });

  await t.test("normalizes email case", async (t) => {
    const passwordHash = await bcrypt.hash("password123", 10);
    await db
      .insertInto("users")
      .values({
        email: "case@example.com",
        password_hash: passwordHash,
      })
      .execute();

    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "CASE@EXAMPLE.COM",
        password: "password123",
      }),
    });

    t.equal(res.status, 200);
  });
});

await t.test("POST /api/auth/logout", async (t) => {
  await t.test("clears auth cookie", async (t) => {
    const res = await app.request("/api/auth/logout", { method: "POST" });

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.success, true);

    const cookie = res.headers.get("set-cookie");
    t.ok(
      cookie?.includes("auth_token=;") ||
        cookie?.includes("auth_token=deleted"),
    );
  });
});

await t.test("GET /api/auth/me", async (t) => {
  await t.test("returns 401 without auth", async (t) => {
    const res = await app.request("/api/auth/me");

    t.equal(res.status, 401);
  });

  await t.test("returns user info with valid token", async (t) => {
    const user = await db
      .insertInto("users")
      .values({
        email: "me@example.com",
        password_hash: "hash",
        is_admin: false,
      })
      .returning(["id", "email"])
      .executeTakeFirstOrThrow();

    const org = await db
      .insertInto("organizations")
      .values({
        name: "My Org",
        slug: "my-org",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .insertInto("user_organizations")
      .values({
        user_id: user.id,
        organization_id: org.id,
        role: "owner",
      })
      .execute();

    const token = signToken({
      userId: user.id,
      email: user.email,
      isAdmin: false,
    });

    const res = await app.request("/api/auth/me", {
      headers: { Cookie: `auth_token=${token}` },
    });

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.email, "me@example.com");
    t.equal(data.organizations.length, 1);
    t.equal(data.organizations[0].name, "My Org");
  });

  await t.test(
    "returns empty organizations for user with no orgs",
    async (t) => {
      const user = await db
        .insertInto("users")
        .values({
          email: "no-orgs@example.com",
          password_hash: "hash",
          is_admin: false,
        })
        .returning(["id", "email"])
        .executeTakeFirstOrThrow();

      const token = signToken({
        userId: user.id,
        email: user.email,
        isAdmin: false,
      });

      const res = await app.request("/api/auth/me", {
        headers: { Cookie: `auth_token=${token}` },
      });

      t.equal(res.status, 200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      t.equal(data.email, "no-orgs@example.com");
      t.equal(data.organizations.length, 0);
    },
  );
});

await t.test("POST /api/auth/verify", async (t) => {
  await t.test("verifies email with valid token", async (t) => {
    await db
      .insertInto("users")
      .values({
        email: "verify@example.com",
        password_hash: "hash",
        verification_token: "valid-token-123",
        verification_expires: new Date(Date.now() + 86400000).toISOString(),
        email_verified: false,
      })
      .execute();

    const res = await app.request("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "valid-token-123" }),
    });

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.success, true);

    const user = await db
      .selectFrom("users")
      .select("email_verified")
      .where("email", "=", "verify@example.com")
      .executeTakeFirst();
    t.equal(user?.email_verified, true);
  });

  await t.test("returns 400 for invalid token", async (t) => {
    const res = await app.request("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "nonexistent-token" }),
    });

    t.equal(res.status, 400);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.error, "Invalid verification token");
  });

  await t.test("returns 400 for expired token", async (t) => {
    await db
      .insertInto("users")
      .values({
        email: "expired@example.com",
        password_hash: "hash",
        verification_token: "expired-token",
        verification_expires: new Date(Date.now() - 86400000).toISOString(),
        email_verified: false,
      })
      .execute();

    const res = await app.request("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "expired-token" }),
    });

    t.equal(res.status, 400);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.error, "Verification token expired");
  });

  await t.test(
    "returns 400 for second verification attempt on same token",
    async (t) => {
      await db
        .insertInto("users")
        .values({
          email: "once@example.com",
          password_hash: "hash",
          verification_token: "one-time-token",
          verification_expires: new Date(Date.now() + 86400000).toISOString(),
          email_verified: false,
        })
        .execute();

      // First verification succeeds
      const res1 = await app.request("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "one-time-token" }),
      });
      t.equal(res1.status, 200);

      // Second attempt with same token fails
      const res2 = await app.request("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "one-time-token" }),
      });
      t.equal(res2.status, 400);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res2.json()) as any;
      t.equal(data.error, "Invalid verification token");
    },
  );
});

await t.test("POST /api/auth/login - organization edge cases", async (t) => {
  await t.test("returns empty organizations for user with none", async (t) => {
    const passwordHash = await bcrypt.hash("password123", 10);
    await db
      .insertInto("users")
      .values({
        email: "no-org@example.com",
        password_hash: passwordHash,
        email_verified: true,
      })
      .execute();

    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "no-org@example.com",
        password: "password123",
      }),
    });

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.same(data.user.organizations, []);
  });

  await t.test("returns multiple organizations for user", async (t) => {
    const passwordHash = await bcrypt.hash("password123", 10);
    const user = await db
      .insertInto("users")
      .values({
        email: "multi-org@example.com",
        password_hash: passwordHash,
        email_verified: true,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const org1 = await db
      .insertInto("organizations")
      .values({ name: "Alpha Org", slug: "alpha" })
      .returning("id")
      .executeTakeFirstOrThrow();

    const org2 = await db
      .insertInto("organizations")
      .values({ name: "Beta Org", slug: "beta" })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .insertInto("user_organizations")
      .values([
        { user_id: user.id, organization_id: org1.id, role: "owner" },
        { user_id: user.id, organization_id: org2.id, role: "member" },
      ])
      .execute();

    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "multi-org@example.com",
        password: "password123",
      }),
    });

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.user.organizations.length, 2);
    // Should be sorted by name ascending
    t.equal(data.user.organizations[0].name, "Alpha Org");
    t.equal(data.user.organizations[1].name, "Beta Org");
  });
});

await t.test("GET /api/auth/me - organization edge cases", async (t) => {
  await t.test("returns empty organizations for user with none", async (t) => {
    const user = await db
      .insertInto("users")
      .values({
        email: "me-no-org@example.com",
        password_hash: "hash",
        is_admin: false,
      })
      .returning(["id", "email"])
      .executeTakeFirstOrThrow();

    const token = signToken({
      userId: user.id,
      email: user.email,
      isAdmin: false,
    });

    const res = await app.request("/api/auth/me", {
      headers: { Cookie: `auth_token=${token}` },
    });

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.same(data.organizations, []);
  });

  await t.test("returns multiple organizations sorted by name", async (t) => {
    const user = await db
      .insertInto("users")
      .values({
        email: "me-multi@example.com",
        password_hash: "hash",
        is_admin: false,
      })
      .returning(["id", "email"])
      .executeTakeFirstOrThrow();

    const org1 = await db
      .insertInto("organizations")
      .values({ name: "Zeta Org", slug: "zeta" })
      .returning("id")
      .executeTakeFirstOrThrow();

    const org2 = await db
      .insertInto("organizations")
      .values({ name: "Alpha Org", slug: "alpha" })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .insertInto("user_organizations")
      .values([
        { user_id: user.id, organization_id: org1.id, role: "member" },
        { user_id: user.id, organization_id: org2.id, role: "owner" },
      ])
      .execute();

    const token = signToken({
      userId: user.id,
      email: user.email,
      isAdmin: false,
    });

    const res = await app.request("/api/auth/me", {
      headers: { Cookie: `auth_token=${token}` },
    });

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.organizations.length, 2);
    t.equal(data.organizations[0].name, "Alpha Org");
    t.equal(data.organizations[1].name, "Zeta Org");
  });
});

await t.test("POST /api/auth/update-password", async (t) => {
  await t.test("returns 401 without authentication", async (t) => {
    const res = await app.request("/api/auth/update-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        current_password: "oldpassword",
        new_password: "newpassword123",
      }),
    });

    t.equal(res.status, 401);
  });

  await t.test("updates password with correct current password", async (t) => {
    const passwordHash = await bcrypt.hash("oldpassword123", 10);
    const user = await db
      .insertInto("users")
      .values({
        email: "updatepw@example.com",
        password_hash: passwordHash,
      })
      .returning(["id", "email"])
      .executeTakeFirstOrThrow();

    const token = signToken({
      userId: user.id,
      email: user.email,
      isAdmin: false,
    });

    const res = await app.request("/api/auth/update-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `auth_token=${token}`,
      },
      body: JSON.stringify({
        current_password: "oldpassword123",
        new_password: "newpassword123",
      }),
    });

    t.equal(res.status, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.success, true);

    // Verify new password works
    const updatedUser = await db
      .selectFrom("users")
      .select("password_hash")
      .where("id", "=", user.id)
      .executeTakeFirstOrThrow();

    const newPasswordValid = await bcrypt.compare(
      "newpassword123",
      updatedUser.password_hash,
    );
    t.equal(newPasswordValid, true);
  });

  await t.test("returns 401 for incorrect current password", async (t) => {
    const passwordHash = await bcrypt.hash("correctpassword", 10);
    const user = await db
      .insertInto("users")
      .values({
        email: "wrongcurrent@example.com",
        password_hash: passwordHash,
      })
      .returning(["id", "email"])
      .executeTakeFirstOrThrow();

    const token = signToken({
      userId: user.id,
      email: user.email,
      isAdmin: false,
    });

    const res = await app.request("/api/auth/update-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `auth_token=${token}`,
      },
      body: JSON.stringify({
        current_password: "wrongpassword",
        new_password: "newpassword123",
      }),
    });

    t.equal(res.status, 401);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    t.equal(data.error, "Current password is incorrect");
  });

  await t.test("returns 400 for short new password", async (t) => {
    const passwordHash = await bcrypt.hash("oldpassword123", 10);
    const user = await db
      .insertInto("users")
      .values({
        email: "shortpw@example.com",
        password_hash: passwordHash,
      })
      .returning(["id", "email"])
      .executeTakeFirstOrThrow();

    const token = signToken({
      userId: user.id,
      email: user.email,
      isAdmin: false,
    });

    const res = await app.request("/api/auth/update-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `auth_token=${token}`,
      },
      body: JSON.stringify({
        current_password: "oldpassword123",
        new_password: "short",
      }),
    });

    t.equal(res.status, 400);
  });

  await t.test("returns 400 for too long new password", async (t) => {
    const passwordHash = await bcrypt.hash("oldpassword123", 10);
    const user = await db
      .insertInto("users")
      .values({
        email: "longpw@example.com",
        password_hash: passwordHash,
      })
      .returning(["id", "email"])
      .executeTakeFirstOrThrow();

    const token = signToken({
      userId: user.id,
      email: user.email,
      isAdmin: false,
    });

    const res = await app.request("/api/auth/update-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `auth_token=${token}`,
      },
      body: JSON.stringify({
        current_password: "oldpassword123",
        new_password: "a".repeat(129),
      }),
    });

    t.equal(res.status, 400);
  });

  await t.test("returns 400 for empty current_password", async (t) => {
    const passwordHash = await bcrypt.hash("oldpassword123", 10);
    const user = await db
      .insertInto("users")
      .values({
        email: "emptycurrent@example.com",
        password_hash: passwordHash,
      })
      .returning(["id", "email"])
      .executeTakeFirstOrThrow();

    const token = signToken({
      userId: user.id,
      email: user.email,
      isAdmin: false,
    });

    const res = await app.request("/api/auth/update-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `auth_token=${token}`,
      },
      body: JSON.stringify({
        current_password: "",
        new_password: "newpassword123",
      }),
    });

    t.equal(res.status, 400);
  });

  await t.test("returns 400 for empty new_password", async (t) => {
    const passwordHash = await bcrypt.hash("oldpassword123", 10);
    const user = await db
      .insertInto("users")
      .values({
        email: "emptynew@example.com",
        password_hash: passwordHash,
      })
      .returning(["id", "email"])
      .executeTakeFirstOrThrow();

    const token = signToken({
      userId: user.id,
      email: user.email,
      isAdmin: false,
    });

    const res = await app.request("/api/auth/update-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `auth_token=${token}`,
      },
      body: JSON.stringify({
        current_password: "oldpassword123",
        new_password: "",
      }),
    });

    t.equal(res.status, 400);
  });

  await t.test("returns 400 for missing current_password field", async (t) => {
    const passwordHash = await bcrypt.hash("oldpassword123", 10);
    const user = await db
      .insertInto("users")
      .values({
        email: "missingcurrent@example.com",
        password_hash: passwordHash,
      })
      .returning(["id", "email"])
      .executeTakeFirstOrThrow();

    const token = signToken({
      userId: user.id,
      email: user.email,
      isAdmin: false,
    });

    const res = await app.request("/api/auth/update-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `auth_token=${token}`,
      },
      body: JSON.stringify({
        new_password: "newpassword123",
      }),
    });

    t.equal(res.status, 400);
  });

  await t.test("returns 400 for missing new_password field", async (t) => {
    const passwordHash = await bcrypt.hash("oldpassword123", 10);
    const user = await db
      .insertInto("users")
      .values({
        email: "missingnew@example.com",
        password_hash: passwordHash,
      })
      .returning(["id", "email"])
      .executeTakeFirstOrThrow();

    const token = signToken({
      userId: user.id,
      email: user.email,
      isAdmin: false,
    });

    const res = await app.request("/api/auth/update-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `auth_token=${token}`,
      },
      body: JSON.stringify({
        current_password: "oldpassword123",
      }),
    });

    t.equal(res.status, 400);
  });

  await t.test("returns 400 for non-string password values", async (t) => {
    const passwordHash = await bcrypt.hash("oldpassword123", 10);
    const user = await db
      .insertInto("users")
      .values({
        email: "nonstring@example.com",
        password_hash: passwordHash,
      })
      .returning(["id", "email"])
      .executeTakeFirstOrThrow();

    const token = signToken({
      userId: user.id,
      email: user.email,
      isAdmin: false,
    });

    // Test with number
    const res1 = await app.request("/api/auth/update-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `auth_token=${token}`,
      },
      body: JSON.stringify({
        current_password: 12345678,
        new_password: "newpassword123",
      }),
    });
    t.equal(res1.status, 400);

    // Test with null
    const res2 = await app.request("/api/auth/update-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `auth_token=${token}`,
      },
      body: JSON.stringify({
        current_password: "oldpassword123",
        new_password: null,
      }),
    });
    t.equal(res2.status, 400);

    // Test with object
    const res3 = await app.request("/api/auth/update-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `auth_token=${token}`,
      },
      body: JSON.stringify({
        current_password: { password: "oldpassword123" },
        new_password: "newpassword123",
      }),
    });
    t.equal(res3.status, 400);
  });

  await t.test(
    "accepts password at exactly min length (8 chars)",
    async (t) => {
      const passwordHash = await bcrypt.hash("oldpassword123", 10);
      const user = await db
        .insertInto("users")
        .values({
          email: "minlength@example.com",
          password_hash: passwordHash,
        })
        .returning(["id", "email"])
        .executeTakeFirstOrThrow();

      const token = signToken({
        userId: user.id,
        email: user.email,
        isAdmin: false,
      });

      const res = await app.request("/api/auth/update-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `auth_token=${token}`,
        },
        body: JSON.stringify({
          current_password: "oldpassword123",
          new_password: "exactly8",
        }),
      });

      t.equal(res.status, 200);
    },
  );

  await t.test(
    "accepts password at exactly max length (128 chars)",
    async (t) => {
      const passwordHash = await bcrypt.hash("oldpassword123", 10);
      const user = await db
        .insertInto("users")
        .values({
          email: "maxlength@example.com",
          password_hash: passwordHash,
        })
        .returning(["id", "email"])
        .executeTakeFirstOrThrow();

      const token = signToken({
        userId: user.id,
        email: user.email,
        isAdmin: false,
      });

      const res = await app.request("/api/auth/update-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `auth_token=${token}`,
        },
        body: JSON.stringify({
          current_password: "oldpassword123",
          new_password: "a".repeat(128),
        }),
      });

      t.equal(res.status, 200);
    },
  );

  await t.test("accepts password with special characters", async (t) => {
    const passwordHash = await bcrypt.hash("oldpassword123", 10);
    const user = await db
      .insertInto("users")
      .values({
        email: "specialchars@example.com",
        password_hash: passwordHash,
      })
      .returning(["id", "email"])
      .executeTakeFirstOrThrow();

    const token = signToken({
      userId: user.id,
      email: user.email,
      isAdmin: false,
    });

    const specialPassword = "P@ssw0rd!#$%^&*()";
    const res = await app.request("/api/auth/update-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `auth_token=${token}`,
      },
      body: JSON.stringify({
        current_password: "oldpassword123",
        new_password: specialPassword,
      }),
    });

    t.equal(res.status, 200);

    // Verify special character password works for login
    const loginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "specialchars@example.com",
        password: specialPassword,
      }),
    });
    t.equal(loginRes.status, 200);
  });

  await t.test("accepts password with unicode characters", async (t) => {
    const passwordHash = await bcrypt.hash("oldpassword123", 10);
    const user = await db
      .insertInto("users")
      .values({
        email: "unicodepw@example.com",
        password_hash: passwordHash,
      })
      .returning(["id", "email"])
      .executeTakeFirstOrThrow();

    const token = signToken({
      userId: user.id,
      email: user.email,
      isAdmin: false,
    });

    const unicodePassword = "password123";
    const res = await app.request("/api/auth/update-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `auth_token=${token}`,
      },
      body: JSON.stringify({
        current_password: "oldpassword123",
        new_password: unicodePassword,
      }),
    });

    t.equal(res.status, 200);

    // Verify unicode password works for login
    const loginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "unicodepw@example.com",
        password: unicodePassword,
      }),
    });
    t.equal(loginRes.status, 200);
  });

  await t.test("accepts password with spaces", async (t) => {
    const passwordHash = await bcrypt.hash("oldpassword123", 10);
    const user = await db
      .insertInto("users")
      .values({
        email: "spacespw@example.com",
        password_hash: passwordHash,
      })
      .returning(["id", "email"])
      .executeTakeFirstOrThrow();

    const token = signToken({
      userId: user.id,
      email: user.email,
      isAdmin: false,
    });

    const spacePassword = "my secret passphrase";
    const res = await app.request("/api/auth/update-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `auth_token=${token}`,
      },
      body: JSON.stringify({
        current_password: "oldpassword123",
        new_password: spacePassword,
      }),
    });

    t.equal(res.status, 200);

    // Verify password with spaces works for login
    const loginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "spacespw@example.com",
        password: spacePassword,
      }),
    });
    t.equal(loginRes.status, 200);
  });

  await t.test("new password works for subsequent login", async (t) => {
    const passwordHash = await bcrypt.hash("oldpassword123", 10);
    const user = await db
      .insertInto("users")
      .values({
        email: "loginafter@example.com",
        password_hash: passwordHash,
      })
      .returning(["id", "email"])
      .executeTakeFirstOrThrow();

    const token = signToken({
      userId: user.id,
      email: user.email,
      isAdmin: false,
    });

    // Update password
    await app.request("/api/auth/update-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `auth_token=${token}`,
      },
      body: JSON.stringify({
        current_password: "oldpassword123",
        new_password: "newpassword123",
      }),
    });

    // Old password should fail
    const oldRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "loginafter@example.com",
        password: "oldpassword123",
      }),
    });
    t.equal(oldRes.status, 401);

    // New password should work
    const newRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "loginafter@example.com",
        password: "newpassword123",
      }),
    });
    t.equal(newRes.status, 200);
  });
});
