import { type } from "arktype";

export const MIN_PRICE = 1; // $0.000001 in micro-units
export const MAX_PRICE = 100_000_000; // $100 in micro-units
export const MIN_PRICE_USD = MIN_PRICE / 1_000_000; // $0.000001
export const MAX_PRICE_USD = MAX_PRICE / 1_000_000; // $100

export const MAX_TAGS = 5;
export const MAX_TAG_LENGTH = 50;

// Add new schemes here - this is the single source of truth
export const SCHEMES = ["exact"] as const;

export const SchemeSchema = type("'exact' | 'flex'");

export type Scheme = (typeof SCHEMES)[number];

export const SCHEME_OPTIONS = [
  ...SCHEMES.map((s) => ({ value: s, label: s, disabled: false })),
  { value: "flex", label: "FLEX", disabled: true },
];

export const TenantSchema = type({
  id: "number",
  name: "string",
  backend_url: "string",
  "wallet_id?": "number | null",
  default_price: "number",
  default_scheme: "string",
  "upstream_auth_header?": "string | null",
  "upstream_auth_value?": "string | null",
  is_active: "boolean",
  created_at: "string",
  "tags?": "string[]",
});

export type Tenant = typeof TenantSchema.infer;

export const NodeSchema = type({
  id: "number",
  name: "string",
  internal_ip: "string",
  "public_ip?": "string | null",
  status: "string",
  "wireguard_public_key?": "string | null",
  "wireguard_address?": "string | null",
  created_at: "string",
});

export type Node = typeof NodeSchema.infer;

export const EndpointSchema = type({
  id: "number",
  tenant_id: "number",
  path_pattern: "string",
  "price?": "number | null",
  "scheme?": "string | null",
  "description?": "string | null",
  priority: "number",
  is_active: "boolean",
  created_at: "string",
  "deleted_at?": "string | null",
  "tags?": "string[]",
});

export type Endpoint = typeof EndpointSchema.infer;

export const TransactionSchema = type({
  id: "number",
  "endpoint_id?": "number | null",
  tenant_id: "number",
  amount: "number",
  tx_hash: "string",
  network: "string",
  "token_symbol?": "string | null",
  "mint_address?": "string | null",
  request_path: "string",
  created_at: "string",
});

export type Transaction = typeof TransactionSchema.infer;

export interface TokenPrice {
  id: number;
  tenant_id: number;
  endpoint_id: number | null;
  token_symbol: string;
  mint_address: string;
  network: string;
  amount: string;
  decimals: number;
}

export interface SupportedToken {
  symbol: string;
  mint: string;
  network: string;
  isUsdPegged: boolean;
}

export const SUPPORTED_TOKENS: SupportedToken[] = [
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
    mint: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603",
    network: "eip155:143",
    isUsdPegged: true,
  },
];
