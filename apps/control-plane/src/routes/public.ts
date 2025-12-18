import { Hono } from "hono";
import { db } from "../server.js";

export const publicRoutes = new Hono();

publicRoutes.post("/waitlist", async (c) => {
  const body = await c.req.json();
  const email = body.email?.trim()?.toLowerCase();

  if (!email) {
    return c.json({ error: "Email is required" }, 400);
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return c.json({ error: "Invalid email format" }, 400);
  }

  try {
    await db
      .insertInto("waitlist")
      .values({ email })
      .onConflict((oc) => oc.column("email").doNothing())
      .execute();

    return c.json({ success: true });
  } catch {
    return c.json({ error: "Failed to join waitlist" }, 500);
  }
});
