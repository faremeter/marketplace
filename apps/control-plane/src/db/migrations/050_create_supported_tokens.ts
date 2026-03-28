import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("supported_tokens")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("symbol", "text", (col) => col.notNull())
    .addColumn("mint_address", "text", (col) => col.notNull())
    .addColumn("network", "text", (col) => col.notNull())
    .addColumn("is_usd_pegged", "boolean", (col) =>
      col.notNull().defaultTo(true),
    )
    .addColumn("decimals", "integer", (col) => col.notNull().defaultTo(6))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await sql`
    CREATE UNIQUE INDEX idx_supported_tokens_unique
    ON supported_tokens (symbol, network)
  `.execute(db);

  const tokens = [
    // Solana USD-pegged
    {
      symbol: "USDC",
      mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      network: "solana-mainnet-beta",
      isUsdPegged: true,
    },
    {
      symbol: "USDT",
      mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
      network: "solana-mainnet-beta",
      isUsdPegged: true,
    },
    {
      symbol: "PYUSD",
      mint: "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo",
      network: "solana-mainnet-beta",
      isUsdPegged: true,
    },
    {
      symbol: "USDG",
      mint: "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH",
      network: "solana-mainnet-beta",
      isUsdPegged: true,
    },
    {
      symbol: "USD1",
      mint: "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB",
      network: "solana-mainnet-beta",
      isUsdPegged: true,
    },
    {
      symbol: "USX",
      mint: "6FrrzDk5mQARGc1TDYoyVnSyRdds1t4PbtohCD6p3tgG",
      network: "solana-mainnet-beta",
      isUsdPegged: true,
    },
    {
      symbol: "CASH",
      mint: "CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH",
      network: "solana-mainnet-beta",
      isUsdPegged: true,
    },
    {
      symbol: "EURC",
      mint: "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr",
      network: "solana-mainnet-beta",
      isUsdPegged: false,
    },
    {
      symbol: "JupUSD",
      mint: "JuprjznTrTSp2UFa3ZBUFgwdAmtZCq4MQCwysN55USD",
      network: "solana-mainnet-beta",
      isUsdPegged: true,
    },
    {
      symbol: "USDS",
      mint: "USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA",
      network: "solana-mainnet-beta",
      isUsdPegged: true,
    },
    {
      symbol: "USDtb",
      mint: "8yXrtJ54jZtE84xEBzTESKuegjcAkAuDrdAhRd8i8n3T",
      network: "solana-mainnet-beta",
      isUsdPegged: true,
    },
    {
      symbol: "USDu",
      mint: "9ckR7pPPvyPadACDTzLwK2ZAEeUJ3qGSnzPs8bVaHrSy",
      network: "solana-mainnet-beta",
      isUsdPegged: true,
    },
    {
      symbol: "USDGO",
      mint: "72puLt71H93Z9CzHuBRTwFpL4TG3WZUhnoCC7p8gxigu",
      network: "solana-mainnet-beta",
      isUsdPegged: true,
    },
    {
      symbol: "FDUSD",
      mint: "9zNQRsGLjNKwCUU5Gq5LR8beUCPzQMVMqKAi3SSZh54u",
      network: "solana-mainnet-beta",
      isUsdPegged: true,
    },
    // EVM USDC
    {
      symbol: "USDC",
      mint: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      network: "base",
      isUsdPegged: true,
    },
    {
      symbol: "USDC",
      mint: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
      network: "polygon",
      isUsdPegged: true,
    },
    {
      symbol: "USDC",
      mint: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
      network: "eip155:137",
      isUsdPegged: true,
    },
    {
      symbol: "USDC",
      mint: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603",
      network: "eip155:143",
      isUsdPegged: true,
    },
  ];

  for (const t of tokens) {
    await sql`
      INSERT INTO supported_tokens (symbol, mint_address, network, is_usd_pegged, decimals)
      VALUES (${t.symbol}, ${t.mint}, ${t.network}, ${t.isUsdPegged}, 6)
    `.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_supported_tokens_unique`.execute(db);
  await db.schema.dropTable("supported_tokens").execute();
}
