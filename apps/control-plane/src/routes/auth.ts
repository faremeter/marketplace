import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { db } from "../db/instance.js";
import { signToken, verifyToken, requireAuth } from "../middleware/auth.js";
import {
  signupLimiter,
  loginLimiter,
  verifyLimiter,
} from "../middleware/rate-limit.js";
import { normalizeEmail, isExpired } from "../lib/validation.js";
import { arktypeValidator } from "@hono/arktype-validator";
import {
  SignupSchema,
  LoginSchema,
  VerifyEmailSchema,
  UpdatePasswordSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
} from "../lib/schemas.js";
import { enqueueEmail } from "../lib/queue.js";
import { getSiteUrl } from "../lib/email.js";
import { syncContactToAttio } from "../lib/attio.js";
import { logger } from "../logger.js";

export const authRoutes = new Hono();

const SALT_ROUNDS = 10;

authRoutes.post(
  "/signup",
  signupLimiter,
  arktypeValidator("json", SignupSchema),
  async (c) => {
    const body = c.req.valid("json");
    const email = normalizeEmail(body.email);

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

    const username = email.split("@")[0] ?? "user";
    const orgName = `${username} Org`;
    const baseSlug = username.toLowerCase().replace(/[^a-z0-9]/g, "-");

    const existingOrg = await db
      .selectFrom("organizations")
      .select("id")
      .where("slug", "=", baseSlug)
      .executeTakeFirst();

    const slug = existingOrg
      ? `${baseSlug}-${crypto.randomBytes(3).toString("hex")}`
      : baseSlug;

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

    await db
      .updateTable("waitlist")
      .set({ signed_up: true })
      .where("email", "=", email)
      .execute();

    const siteUrl = await getSiteUrl();
    if (siteUrl) {
      const verificationUrl = `${siteUrl}/verify-email?token=${verificationToken}`;
      enqueueEmail(email, "verification", {
        verification_url: verificationUrl,
        user_email: email,
      }).catch(() => undefined);
    }

    syncContactToAttio(email).catch(() => undefined);

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
  },
);

authRoutes.post(
  "/login",
  loginLimiter,
  arktypeValidator("json", LoginSchema),
  async (c) => {
    const body = c.req.valid("json");
    const email = normalizeEmail(body.email);

    const user = await db
      .selectFrom("users")
      .select(["id", "email", "password_hash", "is_admin", "email_verified"])
      .where("email", "=", email)
      .executeTakeFirst();

    if (!user) {
      return c.json({ error: "Invalid email or password" }, 401);
    }

    const validPassword = await bcrypt.compare(
      body.password,
      user.password_hash,
    );
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
  },
);

authRoutes.post("/logout", (c) => {
  deleteCookie(c, "auth_token", { path: "/" });
  deleteCookie(c, "admin_token", { path: "/" });
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

  const adminToken = getCookie(c, "admin_token");
  let impersonation: {
    impersonating: boolean;
    impersonated_by: { id: number; email: string };
  } | null = null;

  if (adminToken) {
    const adminPayload = verifyToken(adminToken);
    if (adminPayload) {
      const adminUser = await db
        .selectFrom("users")
        .select(["id", "email", "is_admin"])
        .where("id", "=", adminPayload.userId)
        .executeTakeFirst();
      if (adminUser?.is_admin) {
        impersonation = {
          impersonating: true,
          impersonated_by: { id: adminUser.id, email: adminUser.email },
        };
      }
    }
  }

  return c.json({
    id: user.id,
    email: user.email,
    is_admin: user.is_admin,
    organizations,
    ...impersonation,
  });
});

authRoutes.post("/stop-impersonation", requireAuth, async (c) => {
  const adminToken = getCookie(c, "admin_token");
  if (!adminToken) {
    return c.json({ error: "Not impersonating" }, 400);
  }

  const payload = verifyToken(adminToken);
  if (!payload) {
    return c.json({ error: "Invalid admin token" }, 401);
  }

  const admin = await db
    .selectFrom("users")
    .select(["id", "email", "is_admin"])
    .where("id", "=", payload.userId)
    .executeTakeFirst();

  if (!admin || !admin.is_admin) {
    return c.json({ error: "Invalid admin token" }, 401);
  }

  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 7 * 24 * 60 * 60,
    path: "/",
  };

  setCookie(c, "auth_token", adminToken, cookieOpts);
  deleteCookie(c, "admin_token", { path: "/" });

  logger.info(`Admin ${admin.email} (${admin.id}) stopped impersonation`);

  return c.json({ user: admin });
});

authRoutes.post(
  "/verify",
  verifyLimiter,
  arktypeValidator("json", VerifyEmailSchema),
  async (c) => {
    const body = c.req.valid("json");

    const user = await db
      .selectFrom("users")
      .select(["id", "email", "verification_expires"])
      .where("verification_token", "=", body.token)
      .executeTakeFirst();

    if (!user) {
      return c.json({ error: "Invalid verification token" }, 400);
    }

    if (isExpired(user.verification_expires)) {
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

    const siteUrl = await getSiteUrl();
    if (siteUrl) {
      enqueueEmail(user.email, "welcome", {
        user_email: user.email,
        login_url: `${siteUrl}/login`,
      }).catch(() => undefined);
    }

    return c.json({ success: true });
  },
);

authRoutes.post(
  "/update-password",
  requireAuth,
  arktypeValidator("json", UpdatePasswordSchema),
  async (c) => {
    const authUser = c.get("user");
    const body = c.req.valid("json");

    const user = await db
      .selectFrom("users")
      .select(["id", "password_hash"])
      .where("id", "=", authUser.id)
      .executeTakeFirst();

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    const validPassword = await bcrypt.compare(
      body.current_password,
      user.password_hash,
    );
    if (!validPassword) {
      return c.json({ error: "Current password is incorrect" }, 401);
    }

    const newPasswordHash = await bcrypt.hash(body.new_password, SALT_ROUNDS);

    await db
      .updateTable("users")
      .set({ password_hash: newPasswordHash })
      .where("id", "=", user.id)
      .execute();

    return c.json({ success: true });
  },
);

authRoutes.post(
  "/forgot-password",
  verifyLimiter,
  arktypeValidator("json", ForgotPasswordSchema),
  async (c) => {
    const body = c.req.valid("json");
    const email = normalizeEmail(body.email);

    const user = await db
      .selectFrom("users")
      .select(["id", "email"])
      .where("email", "=", email)
      .executeTakeFirst();

    if (!user) {
      return c.json({ success: true });
    }

    await db
      .deleteFrom("password_reset_tokens")
      .where("user_id", "=", user.id)
      .execute();

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db
      .insertInto("password_reset_tokens")
      .values({
        user_id: user.id,
        token,
        expires_at: expiresAt,
      })
      .execute();

    const siteUrl = await getSiteUrl();
    if (siteUrl) {
      const resetUrl = `${siteUrl}/reset-password?token=${token}`;
      enqueueEmail(email, "password_reset", {
        reset_url: resetUrl,
        user_email: email,
        expires_in_hours: 1,
      }).catch(() => undefined);
    }

    return c.json({ success: true });
  },
);

authRoutes.post(
  "/reset-password",
  verifyLimiter,
  arktypeValidator("json", ResetPasswordSchema),
  async (c) => {
    const body = c.req.valid("json");

    const resetToken = await db
      .selectFrom("password_reset_tokens")
      .select(["id", "user_id", "expires_at", "used_at"])
      .where("token", "=", body.token)
      .executeTakeFirst();

    if (!resetToken) {
      return c.json({ error: "Invalid or expired reset token" }, 400);
    }

    if (resetToken.used_at) {
      return c.json({ error: "Reset link already used" }, 400);
    }

    if (isExpired(resetToken.expires_at)) {
      return c.json({ error: "Reset token expired" }, 400);
    }

    const passwordHash = await bcrypt.hash(body.password, SALT_ROUNDS);

    await db
      .updateTable("users")
      .set({ password_hash: passwordHash })
      .where("id", "=", resetToken.user_id)
      .execute();

    await db
      .updateTable("password_reset_tokens")
      .set({ used_at: new Date() })
      .where("id", "=", resetToken.id)
      .execute();

    return c.json({ success: true });
  },
);

authRoutes.get("/validate-reset-token", async (c) => {
  const token = c.req.query("token");

  if (!token) {
    return c.json({ valid: false });
  }

  const resetToken = await db
    .selectFrom("password_reset_tokens")
    .select(["expires_at", "used_at"])
    .where("token", "=", token)
    .executeTakeFirst();

  const valid =
    resetToken && !resetToken.used_at && !isExpired(resetToken.expires_at);

  return c.json({ valid: !!valid });
});
