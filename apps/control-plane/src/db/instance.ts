import "dotenv/config";
import { Kysely, PostgresDialect } from "kysely";
import pkg from "pg";
const { Pool } = pkg;
import type { Database } from "./schema.js";

if (!process.env.DATABASE_PASSWORD) {
  throw new Error("DATABASE_PASSWORD environment variable is required");
}

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

export const db: Kysely<Database> = new Kysely<Database>({ dialect });
