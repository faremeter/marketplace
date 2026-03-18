import "dotenv/config";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { searchRoutes } from "./routes/search.js";
import { proxiesRoutes } from "./routes/proxies.js";
import { logger } from "./logger.js";
import {
  telemetryMiddleware,
  startFlushTimer,
  stopFlushTimer,
  flush,
} from "./telemetry/index.js";

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));
app.use("*", telemetryMiddleware);
app.route("/api/v1/search", searchRoutes);
app.route("/api/v1/proxies", proxiesRoutes);

startFlushTimer();

async function shutdown(): Promise<void> {
  logger.info("Shutting down, flushing telemetry...");
  stopFlushTimer();
  await flush();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

const port = parseInt(process.env.HTTP_PORT || "1339");

logger.info(`Discovery service starting on http://localhost:${port}`);
serve({ fetch: app.fetch, port });
