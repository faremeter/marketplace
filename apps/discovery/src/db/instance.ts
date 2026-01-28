import "dotenv/config";
import { Kysely, PostgresDialect } from "kysely";
import type { Database } from "./schema.js";

if (!process.env.DATABASE_PASSWORD) {
  throw new Error("DATABASE_PASSWORD environment variable is required");
}

const pkg = await import("pg");
const { Pool } = pkg.default;

const dialect = new PostgresDialect({
  pool: new Pool({
    host: process.env.DATABASE_HOST || "localhost",
    port: parseInt(process.env.DATABASE_PORT || "5432"),
    database: process.env.DATABASE_NAME || "control_plane",
    user: process.env.DATABASE_USER || "control_plane",
    password: process.env.DATABASE_PASSWORD,
    max: 10,
    ssl:
      process.env.DATABASE_SSL === "true"
        ? { rejectUnauthorized: false }
        : undefined,
  }),
});

export const db = new Kysely<Database>({ dialect });
