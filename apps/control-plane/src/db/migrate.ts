import "dotenv/config";
import { promises as fs } from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { Migrator, FileMigrationProvider } from "kysely";
import { createDatabase } from "./client.js";
import { logger } from "../logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  const dbHost = process.env.DATABASE_HOST;
  const dbPort = process.env.DATABASE_PORT;
  const dbName = process.env.DATABASE_NAME;
  const dbUser = process.env.DATABASE_USER;
  const dbPassword = process.env.DATABASE_PASSWORD;

  if (!dbHost || !dbPort || !dbName || !dbUser || !dbPassword) {
    throw new Error("Missing required database environment variables");
  }

  const db = createDatabase({
    host: dbHost,
    port: parseInt(dbPort),
    database: dbName,
    user: dbUser,
    password: dbPassword,
    ssl: process.env.DATABASE_SSL === "true",
  });

  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(__dirname, "migrations"),
    }),
  });

  const command = process.argv[2];
  const target = process.argv[3];

  let result;

  if (command === "down") {
    if (!target) {
      logger.error("Error: migration name required for down command");
      logger.error("Usage: npm run migrate:down <migration-name>");
      process.exit(1);
    }
    logger.info(`Rolling back to migration: ${target}`);
    result = await migrator.migrateTo(target);
  } else if (command === "up") {
    logger.info("Migrating to latest...");
    result = await migrator.migrateToLatest();
  } else {
    logger.info("Migrating to latest...");
    result = await migrator.migrateToLatest();
  }

  const { error, results } = result;

  results?.forEach((it) => {
    if (it.status === "Success") {
      logger.info(`Migration "${it.migrationName}" was executed successfully`);
    } else if (it.status === "Error") {
      logger.error(`Failed to execute migration "${it.migrationName}"`);
    }
  });

  if (error) {
    logger.error("Failed to migrate");
    logger.error(
      error instanceof Error ? error.message : JSON.stringify(error),
    );
    process.exit(1);
  }

  await db.destroy();
}

void runMigration();
