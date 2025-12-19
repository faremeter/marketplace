import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { db } from "../server.js";
import { signToken, requireAuth } from "../middleware/auth.js";

export const authRoutes = new Hono();

const SALT_ROUNDS = 10;

authRoutes.post("/signup", async (c) => {
  const body = await c.req.json();

  if (!body.email || !body.password) {
    return c.json({ error: "Email and password are required" }, 400);
  }

  const email = body.email.toLowerCase().trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.json({ error: "Invalid email format" }, 400);
  }

  if (body.password.length < 8) {
    return c.json({ error: "Password must be at least 8 characters" }, 400);
  }

  const existing = await db
    .selectFrom("users")
    .select("id")
    .where("email", "=", email)
    .executeTakeFirst();

  if (existing) {
    return c.json({ error: "Email already registered" }, 409);
  }

  const passwordHash = await bcrypt.hash(body.password, SALT_ROUNDS);
  const verificationToken = crypto.randomBytes(32).toString("hex");
  const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const user = await db
    .insertInto("users")
    .values({
      email,
      password_hash: passwordHash,
      verification_token: verificationToken,
      verification_expires: verificationExpires,
    })
    .returning(["id", "email", "is_admin", "email_verified"])
    .executeTakeFirstOrThrow();

  // Create default organization for the user
  const username = email.split("@")[0];
  const orgName = `${username}'s Team`;
  const baseSlug = username.toLowerCase().replace(/[^a-z0-9]/g, "-");
  const slug = `${baseSlug}-${crypto.randomBytes(3).toString("hex")}`;

  const org = await db
    .insertInto("organizations")
    .values({
      name: orgName,
      slug,
    })
    .returning(["id", "name", "slug"])
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
    isAdmin: user.is_admin,
  });

  setCookie(c, "auth_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60,
    path: "/",
  });

  return c.json(
    {
      user: {
        id: user.id,
        email: user.email,
        is_admin: user.is_admin,
        email_verified: user.email_verified,
        organizations: [
          { id: org.id, name: org.name, slug: org.slug, role: "owner" },
        ],
      },
      verification_token: verificationToken,
    },
    201,
  );
});

authRoutes.post("/login", async (c) => {
  const body = await c.req.json();

  if (!body.email || !body.password) {
    return c.json({ error: "Email and password are required" }, 400);
  }

  const email = body.email.toLowerCase().trim();

  const user = await db
    .selectFrom("users")
    .select(["id", "email", "password_hash", "is_admin", "email_verified"])
    .where("email", "=", email)
    .executeTakeFirst();

  if (!user) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  const validPassword = await bcrypt.compare(body.password, user.password_hash);
  if (!validPassword) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  const token = signToken({
    userId: user.id,
    email: user.email,
    isAdmin: user.is_admin,
  });

  setCookie(c, "auth_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60,
    path: "/",
  });

  const organizations = await db
    .selectFrom("user_organizations")
    .innerJoin(
      "organizations",
      "organizations.id",
      "user_organizations.organization_id",
    )
    .select([
      "organizations.id",
      "organizations.name",
      "organizations.slug",
      "user_organizations.role",
    ])
    .where("user_organizations.user_id", "=", user.id)
    .orderBy("organizations.name", "asc")
    .execute();

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      is_admin: user.is_admin,
      email_verified: user.email_verified,
      organizations,
    },
  });
});

authRoutes.post("/logout", (c) => {
  deleteCookie(c, "auth_token", { path: "/" });
  return c.json({ success: true });
});

authRoutes.get("/me", requireAuth, async (c) => {
  const user = c.get("user");

  const organizations = await db
    .selectFrom("user_organizations")
    .innerJoin(
      "organizations",
      "organizations.id",
      "user_organizations.organization_id",
    )
    .select([
      "organizations.id",
      "organizations.name",
      "organizations.slug",
      "user_organizations.role",
    ])
    .where("user_organizations.user_id", "=", user.id)
    .orderBy("organizations.name", "asc")
    .execute();

  return c.json({
    id: user.id,
    email: user.email,
    is_admin: user.is_admin,
    organizations,
  });
});

authRoutes.post("/verify", async (c) => {
  const body = await c.req.json();

  if (!body.token) {
    return c.json({ error: "Verification token required" }, 400);
  }

  const user = await db
    .selectFrom("users")
    .select(["id", "verification_expires"])
    .where("verification_token", "=", body.token)
    .executeTakeFirst();

  if (!user) {
    return c.json({ error: "Invalid verification token" }, 400);
  }

  if (
    user.verification_expires &&
    new Date(user.verification_expires) < new Date()
  ) {
    return c.json({ error: "Verification token expired" }, 400);
  }

  await db
    .updateTable("users")
    .set({
      email_verified: true,
      verification_token: null,
      verification_expires: null,
    })
    .where("id", "=", user.id)
    .execute();

  return c.json({ success: true });
});
