import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("token_prices")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("tenant_id", "integer", (col) =>
      col.notNull().references("tenants.id").onDelete("cascade"),
    )
    .addColumn("endpoint_id", "integer", (col) =>
      col.references("endpoints.id").onDelete("cascade"),
    )
    .addColumn("token_symbol", "text", (col) => col.notNull())
    .addColumn("mint_address", "text", (col) => col.notNull())
    .addColumn("network", "text", (col) => col.notNull())
    .addColumn("amount", "bigint", (col) => col.notNull())
    .addColumn("decimals", "integer", (col) => col.notNull().defaultTo(6))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await sql`
    CREATE UNIQUE INDEX idx_token_prices_unique
    ON token_prices (tenant_id, COALESCE(endpoint_id, 0), token_symbol, network)
  `.execute(db);

  await db.schema
    .createIndex("idx_token_prices_tenant")
    .on("token_prices")
    .column("tenant_id")
    .execute();

  // USD-pegged tokens only (EURC excluded - needs separate pricing)
  const usdTokens = [
    {
      symbol: "USDC",
      mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      network: "solana-mainnet-beta",
    },
    {
      symbol: "USDT",
      mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
      network: "solana-mainnet-beta",
    },
    {
      symbol: "PYUSD",
      mint: "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo",
      network: "solana-mainnet-beta",
    },
    {
      symbol: "USDG",
      mint: "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH",
      network: "solana-mainnet-beta",
    },
    {
      symbol: "USD1",
      mint: "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB",
      network: "solana-mainnet-beta",
    },
    {
      symbol: "USX",
      mint: "6FrrzDk5mQARGc1TDYoyVnSyRdds1t4PbtohCD6p3tgG",
      network: "solana-mainnet-beta",
    },
    {
      symbol: "CASH",
      mint: "CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH",
      network: "solana-mainnet-beta",
    },
    {
      symbol: "JupUSD",
      mint: "JuprjznTrTSp2UFa3ZBUFgwdAmtZCq4MQCwysN55USD",
      network: "solana-mainnet-beta",
    },
    {
      symbol: "USDS",
      mint: "USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA",
      network: "solana-mainnet-beta",
    },
    {
      symbol: "USDtb",
      mint: "8yXrtJ54jZtE84xEBzTESKuegjcAkAuDrdAhRd8i8n3T",
      network: "solana-mainnet-beta",
    },
    {
      symbol: "USDu",
      mint: "9ckR7pPPvyPadACDTzLwK2ZAEeUJ3qGSnzPs8bVaHrSy",
      network: "solana-mainnet-beta",
    },
    {
      symbol: "USDGO",
      mint: "72puLt71H93Z9CzHuBRTwFpL4TG3WZUhnoCC7p8gxigu",
      network: "solana-mainnet-beta",
    },
    {
      symbol: "FDUSD",
      mint: "9zNQRsGLjNKwCUU5Gq5LR8beUCPzQMVMqKAi3SSZh54u",
      network: "solana-mainnet-beta",
    },
    // EVM USDC
    {
      symbol: "USDC",
      mint: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      network: "base",
    },
    {
      symbol: "USDC",
      mint: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
      network: "polygon",
    },
    {
      symbol: "USDC",
      mint: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
      network: "eip155:137",
    },
    {
      // Monad mainnet (chain ID 143)
      symbol: "USDC",
      mint: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603",
      network: "eip155:143",
    },
  ];

  // Seed tenant-level token_prices from existing default_price_usdc
  for (const token of usdTokens) {
    await sql`
      INSERT INTO token_prices (tenant_id, endpoint_id, token_symbol, mint_address, network, amount, decimals)
      SELECT id, NULL, ${token.symbol}, ${token.mint}, ${token.network},
             default_price_usdc, 6
      FROM tenants
      WHERE default_price_usdc > 0
    `.execute(db);
  }

  // Seed endpoint-level token_prices from existing price_usdc overrides
  for (const token of usdTokens) {
    await sql`
      INSERT INTO token_prices (tenant_id, endpoint_id, token_symbol, mint_address, network, amount, decimals)
      SELECT tenant_id, id, ${token.symbol}, ${token.mint}, ${token.network},
             price_usdc, 6
      FROM endpoints
      WHERE price_usdc IS NOT NULL AND price_usdc > 0 AND is_active = true
    `.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex("idx_token_prices_tenant").execute();
  await sql`DROP INDEX IF EXISTS idx_token_prices_unique`.execute(db);
  await db.schema.dropTable("token_prices").execute();
}
