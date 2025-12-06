import { Hono } from "hono";
import { db } from "../server.js";

export const transactionsRoutes = new Hono();

transactionsRoutes.get("/", async (c) => {
  const tenantId = parseInt(c.req.param("tenantId") ?? "");
  const limit = parseInt(c.req.query("limit") ?? "50");
  const offset = parseInt(c.req.query("offset") ?? "0");
  const from = c.req.query("from");
  const to = c.req.query("to");

  let query = db
    .selectFrom("transactions")
    .selectAll()
    .where("tenant_id", "=", tenantId)
    .orderBy("created_at", "desc")
    .limit(limit)
    .offset(offset);

  if (from) {
    query = query.where("created_at", ">=", new Date(from));
  }
  if (to) {
    query = query.where("created_at", "<=", new Date(to));
  }

  const transactions = await query.execute();
  return c.json(transactions);
});

transactionsRoutes.get("/:id", async (c) => {
  const tenantId = parseInt(c.req.param("tenantId") ?? "");
  const id = parseInt(c.req.param("id"));

  const transaction = await db
    .selectFrom("transactions")
    .selectAll()
    .where("id", "=", id)
    .where("tenant_id", "=", tenantId)
    .executeTakeFirst();

  if (!transaction) {
    return c.json({ error: "Transaction not found" }, 404);
  }
  return c.json(transaction);
});
