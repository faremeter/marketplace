// Test database helper for running tests with isolated database instances
import "../setup/env.js";
import {
  createTestDatabase,
  setupTestSchema,
  teardownTestDatabase,
} from "../setup/db.js";
import type { Kysely } from "kysely";
import type { Database } from "../../db/schema.js";

/**
 * Run a test with an isolated in-memory SQLite database.
 * The database is created fresh for each test and destroyed after.
 */
export async function withTestDb<T>(
  fn: (db: Kysely<Database>) => Promise<T>,
): Promise<T> {
  const db = createTestDatabase();
  await setupTestSchema(db);
  try {
    return await fn(db);
  } finally {
    await teardownTestDatabase(db);
  }
}

/**
 * Seed common test data into the database.
 * Returns references to created entities for use in tests.
 */
export async function seedTestData(db: Kysely<Database>) {
  // Create test organization
  const org = await db
    .insertInto("organizations")
    .values({
      name: "Test Organization",
      slug: "test-org",
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  // Create test user
  const user = await db
    .insertInto("users")
    .values({
      email: "test@example.com",
      password_hash: "$2b$10$test-hash-not-real",
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  // Link user to organization
  await db
    .insertInto("user_organizations")
    .values({
      user_id: user.id,
      organization_id: org.id,
      role: "owner",
    })
    .execute();

  // Create test node
  const node = await db
    .insertInto("nodes")
    .values({
      name: "test-node-1",
      internal_ip: "10.0.0.1",
      public_ip: "1.2.3.4",
      status: "active",
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  // Create test wallet
  const wallet = await db
    .insertInto("wallets")
    .values({
      organization_id: org.id,
      name: "Test Wallet",
      wallet_config: JSON.stringify({
        solana: {
          "mainnet-beta": {
            address: "test-solana-address",
            key: "enc:test-encrypted-key",
          },
        },
      }),
      funding_status: "funded",
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  return { org, user, node, wallet };
}

/**
 * Create a test tenant with associated data.
 */
export async function createTestTenant(
  db: Kysely<Database>,
  orgId: number,
  walletId: number,
  nodeId: number,
  overrides: Partial<{
    name: string;
    backend_url: string;
    status: string;
    default_price_usdc: number;
    default_scheme: string;
  }> = {},
) {
  const tenant = await db
    .insertInto("tenants")
    .values({
      name: overrides.name ?? "test-tenant",
      backend_url: overrides.backend_url ?? "https://api.example.com",
      organization_id: orgId,
      wallet_id: walletId,
      status: overrides.status ?? "active",
      default_price_usdc: overrides.default_price_usdc ?? 0.01,
      default_scheme: overrides.default_scheme ?? "per_request",
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  // Link tenant to node
  await db
    .insertInto("tenant_nodes")
    .values({
      tenant_id: tenant.id,
      node_id: nodeId,
      is_primary: true,
    })
    .execute();

  return tenant;
}
