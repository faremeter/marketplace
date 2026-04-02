import { logger } from "../logger.js";
import { evm, solana } from "@faremeter/info";

// Known stablecoin addresses for filtering transactions.
// Includes EURC for transaction display even though it's excluded from migration seeding
// (EURC needs separate pricing, but we still want to show EURC transactions if they occur).
const KNOWN_STABLECOIN_ADDRESSES = new Set<string>(
  [
    // Solana stablecoins
    solana.lookupKnownSPLToken("mainnet-beta", "USDC")?.address,
    solana.lookupKnownSPLToken("mainnet-beta", "USDT")?.address,
    solana.lookupKnownSPLToken("mainnet-beta", "PYUSD")?.address,
    solana.lookupKnownSPLToken("mainnet-beta", "USDG")?.address,
    solana.lookupKnownSPLToken("mainnet-beta", "USD1")?.address,
    solana.lookupKnownSPLToken("mainnet-beta", "USX")?.address,
    solana.lookupKnownSPLToken("mainnet-beta", "CASH")?.address,
    solana.lookupKnownSPLToken("mainnet-beta", "EURC")?.address,
    solana.lookupKnownSPLToken("mainnet-beta", "JupUSD")?.address,
    solana.lookupKnownSPLToken("mainnet-beta", "USDS")?.address,
    solana.lookupKnownSPLToken("mainnet-beta", "USDtb")?.address,
    solana.lookupKnownSPLToken("mainnet-beta", "USDu")?.address,
    solana.lookupKnownSPLToken("mainnet-beta", "USDGO")?.address,
    solana.lookupKnownSPLToken("mainnet-beta", "FDUSD")?.address,
    // EVM USDC
    evm.lookupKnownAsset("base", "USDC")?.address?.toLowerCase(),
    evm.lookupKnownAsset("eip155:137", "USDC")?.address?.toLowerCase(),
    evm.lookupKnownAsset("eip155:143", "USDC")?.address?.toLowerCase(),
  ].filter((addr): addr is string => addr !== undefined),
);

const CORBITS_DASH_API_URL = process.env.CORBITS_DASH_API_URL;
const CORBITS_DASH_API_KEY = process.env.CORBITS_DASH_API_KEY;

interface Account {
  id: number;
  name: string;
  access_token: string;
  grafana_dashboard_url: string | null;
  is_active: boolean;
  created_at: string;
}

interface TrackedAddress {
  id: number;
  account_id: number;
  chain: string;
  address: string;
  is_active: boolean;
  created_at: string;
}

export interface CorbitsTransaction {
  id: number;
  chain: string;
  signature: string;
  block_time: string;
  from_address: string | null;
  to_address: string | null;
  amount: string;
  direction: "incoming" | "outgoing" | "fee" | null;
  status: "pending" | "confirmed" | "finalized" | "failed";
  mint_address: string | null;
  tracked_address_id: number;
  created_at: string;
}

interface ApiResponse<T> {
  data: T;
}

interface ListResponse<T> {
  data: T[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
}

async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  if (!CORBITS_DASH_API_KEY) {
    throw new Error("CORBITS_DASH_API_KEY is not configured");
  }
  if (!CORBITS_DASH_API_URL) {
    throw new Error("CORBITS_DASH_API_URL is not configured");
  }

  const url = `${CORBITS_DASH_API_URL}${path}`;
  const options: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${CORBITS_DASH_API_KEY}`,
      "Content-Type": "application/json",
    },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  const response = await fetch(url, options);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Corbits dash API error: ${response.status} ${error}`);
  }

  return response.json() as Promise<T>;
}

export async function createAccount(
  name: string,
  accessToken: string,
): Promise<Account> {
  logger.info(`Creating corbits dash account: ${name}`);
  const response = await apiRequest<ApiResponse<Account>>("POST", "/accounts", {
    name,
    access_token: accessToken,
    is_active: true,
  });
  logger.info(
    `Created corbits dash account: ${name} (id: ${response.data.id})`,
  );
  return response.data;
}

export async function findAccountByName(name: string): Promise<Account | null> {
  const response = await apiRequest<ListResponse<Account>>(
    "GET",
    `/accounts?name=${encodeURIComponent(name)}&limit=1`,
  );
  return response.data.find((a) => a.name === name) ?? null;
}

export async function deactivateAccount(accountId: number): Promise<void> {
  await apiRequest<ApiResponse<Account>>("DELETE", `/accounts/${accountId}`);
}

export async function createTrackedAddress(
  accountId: number,
  chain: string,
  address: string,
): Promise<TrackedAddress> {
  logger.info(
    `Adding tracked address for account ${accountId}: ${chain} ${address}`,
  );
  const response = await apiRequest<ApiResponse<TrackedAddress>>(
    "POST",
    "/tracked-addresses",
    {
      account_id: accountId,
      chain,
      address,
      is_active: true,
    },
  );
  return response.data;
}

export async function getTrackedAddressesForAccount(
  accountId: number,
): Promise<TrackedAddress[]> {
  const response = await apiRequest<ListResponse<TrackedAddress>>(
    "GET",
    `/tracked-addresses?account_id=${accountId}&limit=100`,
  );
  return response.data;
}

function isStablecoinTransaction(tx: CorbitsTransaction): boolean {
  if (!tx.mint_address) return false;
  const mintLower = tx.mint_address.toLowerCase();
  return (
    KNOWN_STABLECOIN_ADDRESSES.has(tx.mint_address) ||
    KNOWN_STABLECOIN_ADDRESSES.has(mintLower)
  );
}

// All supported stablecoins use 6 decimals. Update if tokens with different decimals are added.
const TOKEN_DECIMALS = 6;

function formatTokenAmount(rawAmount: string): string {
  const num = parseFloat(rawAmount) / 10 ** TOKEN_DECIMALS;
  return num.toFixed(2);
}

export async function getTransactionsForAccount(
  accountId: number,
  options?: { limit?: number; offset?: number },
): Promise<ListResponse<CorbitsTransaction>> {
  const addresses = await getTrackedAddressesForAccount(accountId);
  if (addresses.length === 0) {
    return {
      data: [],
      meta: {
        total: 0,
        limit: options?.limit ?? 50,
        offset: 0,
        has_more: false,
      },
    };
  }

  const params = new URLSearchParams();
  for (const addr of addresses) {
    params.append("tracked_address_id", addr.id.toString());
  }
  params.set("limit", "200");
  params.set("sort", "block_time");
  params.set("order", "desc");

  const response = await apiRequest<ListResponse<CorbitsTransaction>>(
    "GET",
    `/transactions?${params}`,
  );

  const stablecoinTransactions = response.data
    .filter(isStablecoinTransaction)
    .map((tx) => ({
      ...tx,
      amount: formatTokenAmount(tx.amount),
    }));

  return {
    data: stablecoinTransactions,
    meta: {
      total: stablecoinTransactions.length,
      limit: options?.limit ?? 50,
      offset: options?.offset ?? 0,
      has_more: false,
    },
  };
}

export async function deactivateTrackedAddress(
  addressId: number,
): Promise<void> {
  await apiRequest<ApiResponse<TrackedAddress>>(
    "DELETE",
    `/tracked-addresses/${addressId}`,
  );
}

interface WalletAddresses {
  solana?: string | undefined;
  base?: string | undefined;
  polygon?: string | undefined;
  monad?: string | undefined;
}

export async function setupAccountWithAddresses(
  tenantName: string,
  accessToken: string,
  addresses: WalletAddresses,
): Promise<Account> {
  logger.info(`Setting up corbits dash account for tenant: ${tenantName}`);
  const account = await createAccount(tenantName, accessToken);

  const trackingPromises: Promise<TrackedAddress>[] = [];

  if (addresses.solana) {
    trackingPromises.push(
      createTrackedAddress(account.id, "solana", addresses.solana),
    );
  }

  if (addresses.base) {
    trackingPromises.push(
      createTrackedAddress(account.id, "base", addresses.base),
    );
  }

  if (addresses.polygon) {
    trackingPromises.push(
      createTrackedAddress(account.id, "polygon", addresses.polygon),
    );
  }

  if (addresses.monad) {
    trackingPromises.push(
      createTrackedAddress(account.id, "monad", addresses.monad),
    );
  }

  await Promise.all(trackingPromises);

  logger.info(`Corbits dash setup complete for tenant: ${tenantName}`);
  return account;
}

export async function updateAccountAddresses(
  tenantName: string,
  addresses: WalletAddresses,
): Promise<void> {
  logger.info(`Updating corbits dash addresses for tenant: ${tenantName}`);
  const account = await findAccountByName(tenantName);
  if (!account) {
    logger.error(`Cannot update addresses: account ${tenantName} not found`);
    return;
  }

  const existingAddresses = await getTrackedAddressesForAccount(account.id);
  logger.info(
    `Deactivating ${existingAddresses.length} existing addresses for ${tenantName}`,
  );
  for (const addr of existingAddresses) {
    await deactivateTrackedAddress(addr.id);
  }

  const trackingPromises: Promise<TrackedAddress>[] = [];

  if (addresses.solana) {
    trackingPromises.push(
      createTrackedAddress(account.id, "solana", addresses.solana),
    );
  }

  if (addresses.base) {
    trackingPromises.push(
      createTrackedAddress(account.id, "base", addresses.base),
    );
  }

  if (addresses.polygon) {
    trackingPromises.push(
      createTrackedAddress(account.id, "polygon", addresses.polygon),
    );
  }

  if (addresses.monad) {
    trackingPromises.push(
      createTrackedAddress(account.id, "monad", addresses.monad),
    );
  }

  await Promise.all(trackingPromises);
  logger.info(`Corbits dash addresses updated for tenant: ${tenantName}`);
}

export async function renameAccount(
  oldName: string,
  newName: string,
): Promise<void> {
  logger.info(`Renaming corbits dash account: ${oldName} -> ${newName}`);
  try {
    const account = await findAccountByName(oldName);
    if (account) {
      await apiRequest<ApiResponse<Account>>("PUT", `/accounts/${account.id}`, {
        name: newName,
      });
      logger.info(`Corbits dash account renamed: ${oldName} -> ${newName}`);
    } else {
      logger.info(`No corbits dash account found for tenant: ${oldName}`);
    }
  } catch (err) {
    logger.error(
      `Failed to rename corbits dash account ${oldName} -> ${newName}: ${err}`,
    );
  }
}

export async function cleanupAccount(tenantName: string): Promise<void> {
  logger.info(`Cleaning up corbits dash account for tenant: ${tenantName}`);
  try {
    const account = await findAccountByName(tenantName);
    if (account) {
      const addresses = await getTrackedAddressesForAccount(account.id);
      for (const addr of addresses) {
        await deactivateTrackedAddress(addr.id);
      }
      await deactivateAccount(account.id);
      logger.info(`Corbits dash account cleaned up for tenant: ${tenantName}`);
    } else {
      logger.info(`No corbits dash account found for tenant: ${tenantName}`);
    }
  } catch (err) {
    logger.error(
      `Failed to cleanup corbits dash account ${tenantName}: ${err}`,
    );
  }
}
