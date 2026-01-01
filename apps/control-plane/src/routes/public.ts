import { Hono } from "hono";
import { db } from "../server.js";
import { optionalAuth, requireAuth } from "../middleware/auth.js";
import { normalizeEmail, isExpired } from "../lib/validation.js";
import { arktypeValidator } from "@hono/arktype-validator";
import { WaitlistSchema } from "../lib/schemas.js";

export const publicRoutes = new Hono();

publicRoutes.post(
  "/waitlist",
  arktypeValidator("json", WaitlistSchema),
  async (c) => {
    const body = c.req.valid("json");
    const email = normalizeEmail(body.email);

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
  },
);

// Get invitation details (public, no auth required)
publicRoutes.get("/invitations/:token", optionalAuth, async (c) => {
  const token = c.req.param("token");
  const user = c.get("user");

  const invitation = await db
    .selectFrom("organization_invitations")
    .innerJoin(
      "organizations",
      "organizations.id",
      "organization_invitations.organization_id",
    )
    .select([
      "organization_invitations.id",
      "organization_invitations.email",
      "organization_invitations.role",
      "organization_invitations.expires_at",
      "organization_invitations.accepted_at",
      "organizations.name as organization_name",
    ])
    .where("organization_invitations.token", "=", token)
    .executeTakeFirst();

  if (!invitation) {
    return c.json({ error: "Invitation not found" }, 404);
  }

  if (invitation.accepted_at) {
    return c.json({ error: "Invitation has already been accepted" }, 410);
  }

  if (isExpired(invitation.expires_at)) {
    return c.json({ error: "Invitation has expired" }, 410);
  }

  // Include whether the current user's email matches the invitation
  const emailMatch = user
    ? user.email.toLowerCase() === invitation.email.toLowerCase()
    : null;

  return c.json({
    ...invitation,
    currentUserEmail: user?.email || null,
    emailMatch,
  });
});

// Accept invitation (requires auth)
publicRoutes.post("/invitations/:token/accept", requireAuth, async (c) => {
  const token = c.req.param("token");
  const user = c.get("user");

  const invitation = await db
    .selectFrom("organization_invitations")
    .selectAll()
    .where("token", "=", token)
    .executeTakeFirst();

  if (!invitation) {
    return c.json({ error: "Invitation not found" }, 404);
  }

  if (invitation.accepted_at) {
    return c.json({ error: "Invitation has already been accepted" }, 410);
  }

  if (isExpired(invitation.expires_at)) {
    return c.json({ error: "Invitation has expired" }, 410);
  }

  // Check email matches
  if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
    return c.json(
      {
        error: `This invitation was sent to ${invitation.email}. Please log in with that email address.`,
        expectedEmail: invitation.email,
      },
      403,
    );
  }

  // Check if already a member
  const existingMembership = await db
    .selectFrom("user_organizations")
    .select("id")
    .where("user_id", "=", user.id)
    .where("organization_id", "=", invitation.organization_id)
    .executeTakeFirst();

  if (existingMembership) {
    // Mark invitation as accepted anyway
    await db
      .updateTable("organization_invitations")
      .set({ accepted_at: new Date() })
      .where("id", "=", invitation.id)
      .execute();

    return c.json(
      { error: "You are already a member of this organization" },
      409,
    );
  }

  // Add user to organization
  await db
    .insertInto("user_organizations")
    .values({
      user_id: user.id,
      organization_id: invitation.organization_id,
      role: invitation.role,
    })
    .execute();

  // Mark invitation as accepted
  await db
    .updateTable("organization_invitations")
    .set({ accepted_at: new Date() })
    .where("id", "=", invitation.id)
    .execute();

  // Get the organization details to return
  const org = await db
    .selectFrom("organizations")
    .select(["id", "name", "slug"])
    .where("id", "=", invitation.organization_id)
    .executeTakeFirstOrThrow();

  return c.json({
    success: true,
    organization: {
      ...org,
      role: invitation.role,
    },
  });
});
