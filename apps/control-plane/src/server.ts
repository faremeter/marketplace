import "dotenv/config";
import { exec } from "child_process";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { tenantsRoutes } from "./routes/tenants.js";
import { nodesRoutes } from "./routes/nodes.js";
import { endpointsRoutes } from "./routes/endpoints.js";
import { transactionsRoutes } from "./routes/transactions.js";
import { openapiRoutes } from "./routes/openapi.js";
import { authRoutes } from "./routes/auth.js";
import { organizationsRoutes } from "./routes/organizations.js";
import { adminRoutes } from "./routes/admin.js";
import { walletsRoutes } from "./routes/wallets.js";
import { publicRoutes } from "./routes/public.js";
import { internalRoutes } from "./routes/internal.js";
import { logger } from "./logger.js";
import { startQueue, stopQueue } from "./lib/queue.js";

const app = new Hono();

if (!process.env.WALLET_ENCRYPTION_KEY) {
  throw new Error("WALLET_ENCRYPTION_KEY environment variable is required");
}
if (process.env.WALLET_ENCRYPTION_KEY.length !== 64) {
  throw new Error("WALLET_ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
}

app.use(
  "*",
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:1338",
    credentials: true,
  }),
);

app.get("/health", (c) => c.json({ status: "ok" }));
app.route("/api/auth", authRoutes);
app.route("/api/organizations", organizationsRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/tenants", tenantsRoutes);
app.route("/api/tenants/:tenantId/endpoints", endpointsRoutes);
app.route("/api/tenants/:tenantId/transactions", transactionsRoutes);
app.route("/api/tenants/:tenantId/openapi", openapiRoutes);
app.route("/api/nodes", nodesRoutes);
app.route("/api/wallets", walletsRoutes);
app.route("/api", publicRoutes);
app.route("/internal", internalRoutes);

const port = parseInt(process.env.HTTP_PORT || "1337");

const dbConfig = {
  host: process.env.DATABASE_HOST || "localhost",
  port: parseInt(process.env.DATABASE_PORT || "5432"),
  database: process.env.DATABASE_NAME || "control_plane",
  user: process.env.DATABASE_USER || "control_plane",
  password: process.env.DATABASE_PASSWORD as string, // validated by db/instance.ts
  ssl: process.env.DATABASE_SSL === "true",
};

startQueue(dbConfig).catch((err) => {
  logger.error(`Failed to start queue: ${err}`);
});

exec("sudo systemctl start wg-peers", (err) => {
  if (err) {
    logger.warn(`Failed to sync WireGuard peers: ${err.message}`);
  } else {
    logger.info("WireGuard peers synced from database");
  }
});

process.on("SIGTERM", async () => {
  logger.info("Received SIGTERM, shutting down...");
  await stopQueue();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("Received SIGINT, shutting down...");
  await stopQueue();
  process.exit(0);
});

logger.info(`Control plane starting on http://localhost:${port}`);
serve({ fetch: app.fetch, port });
