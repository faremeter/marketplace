import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import jwt from "jsonwebtoken";
import { db } from "../server.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";

export interface JwtPayload {
  userId: number;
  email: string;
  isAdmin: boolean;
}

export interface AuthUser {
  id: number;
  email: string;
  is_admin: boolean;
}

declare module "hono" {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export async function requireAuth(c: Context, next: Next) {
  const token = getCookie(c, "auth_token");

  if (!token) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const payload = verifyToken(token);
  if (!payload) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }

  const user = await db
    .selectFrom("users")
    .select(["id", "email", "is_admin"])
    .where("id", "=", payload.userId)
    .executeTakeFirst();

  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }

  c.set("user", user);
  await next();
}

export async function requireAdmin(c: Context, next: Next) {
  const token = getCookie(c, "auth_token");

  if (!token) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const payload = verifyToken(token);
  if (!payload) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }

  const user = await db
    .selectFrom("users")
    .select(["id", "email", "is_admin"])
    .where("id", "=", payload.userId)
    .executeTakeFirst();

  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }

  if (!user.is_admin) {
    return c.json({ error: "Admin access required" }, 403);
  }

  c.set("user", user);
  await next();
}

export async function optionalAuth(c: Context, next: Next) {
  const token = getCookie(c, "auth_token");

  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      const user = await db
        .selectFrom("users")
        .select(["id", "email", "is_admin"])
        .where("id", "=", payload.userId)
        .executeTakeFirst();

      if (user) {
        c.set("user", user);
      }
    }
  }

  await next();
}

export async function requireTenantAccess(c: Context, next: Next) {
  const token = getCookie(c, "auth_token");

  if (!token) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const payload = verifyToken(token);
  if (!payload) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }

  const user = await db
    .selectFrom("users")
    .select(["id", "email", "is_admin"])
    .where("id", "=", payload.userId)
    .executeTakeFirst();

  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }

  if (user.is_admin) {
    c.set("user", user);
    return next();
  }

  const tenantId = parseInt(c.req.param("tenantId") ?? "");
  if (!tenantId) {
    return c.json({ error: "Tenant ID required" }, 400);
  }

  const tenant = await db
    .selectFrom("tenants")
    .select("organization_id")
    .where("id", "=", tenantId)
    .executeTakeFirst();

  if (!tenant) {
    return c.json({ error: "Tenant not found" }, 404);
  }

  const membership = await db
    .selectFrom("user_organizations")
    .select("role")
    .where("user_id", "=", user.id)
    .where("organization_id", "=", tenant.organization_id)
    .executeTakeFirst();

  if (!membership) {
    return c.json({ error: "Access denied" }, 403);
  }

  c.set("user", user);
  await next();
}
