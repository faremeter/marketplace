import "dotenv/config";
import { Kysely, PostgresDialect, SqliteDialect } from "kysely";
import type { Database } from "./schema.js";
import { SqliteAdapterPlugin } from "./plugins/sqlite-adapter.js";
import { setupTestSchema as setupTestSchemaShared } from "@1click/test-db";

export const isTest = process.env.NODE_ENV === "test";

let db: Kysely<Database>;

if (isTest) {
  const Database = (await import("better-sqlite3")).default;
  const sqliteDb = new Database(":memory:");
  sqliteDb.pragma("foreign_keys = ON");

  db = new Kysely<Database>({
    dialect: new SqliteDialect({ database: sqliteDb }),
    plugins: [new SqliteAdapterPlugin()],
  });
} else {
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

  db = new Kysely<Database>({ dialect });
}

export { db };

export async function setupTestSchema(): Promise<void> {
  if (!isTest) return;
  await setupTestSchemaShared(db);
}

export async function clearTestData(): Promise<void> {
  if (!isTest) return;

  await db.deleteFrom("endpoints").execute();
  await db.deleteFrom("tenants").execute();
  await db.deleteFrom("wallets").execute();
  await db.deleteFrom("organizations").execute();
}
