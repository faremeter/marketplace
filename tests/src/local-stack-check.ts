import { wrap as wrapFetch } from "@faremeter/fetch";
import {
  fetchEscrowAccount,
  findPendingSettlementsByEscrow,
  getCreateEscrowInstructionAsync,
  getDepositInstructionAsync,
  getRegisterSessionKeyInstructionAsync,
} from "@faremeter/flex-solana";
import { solana } from "@faremeter/info";
import { createPaymentHandler as createExactPaymentHandler } from "@faremeter/payment-solana/exact";
import { createPaymentHandler as createFlexPaymentHandler } from "@faremeter/payment-solana/flex/client";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import fs from "node:fs";
import {
  type Instruction,
  type KeyPairSigner,
  type Signature,
  address,
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createTransactionMessage,
  getAddressFromPublicKey,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import { partiallySignTransaction } from "@solana/transactions";
import type { webcrypto } from "node:crypto";

const CONTROL_PLANE_BASE_URL =
  process.env.LOCAL_CONTROL_PLANE_BASE_URL ?? "http://127.0.0.1:11337";
const DISCOVERY_BASE_URL =
  process.env.LOCAL_DISCOVERY_BASE_URL ?? "http://127.0.0.1:11339";
const UI_URL = process.env.LOCAL_UI_URL ?? "http://127.0.0.1:11338";
const PROXY_URL_A =
  process.env.LOCAL_PROXY_URL_A ??
  "http://demo-api.local.proxy.localhost:18080/v1/chat/completions";
const PROXY_HEALTH_URL_A =
  process.env.LOCAL_PROXY_HEALTH_URL_A ??
  "http://demo-api.local.proxy.localhost:18080/health";
const PROXY_URL_B =
  process.env.LOCAL_PROXY_URL_B ??
  "http://demo-api.local.proxy.localhost:18081/v1/chat/completions";
const PROXY_HEALTH_URL_B =
  process.env.LOCAL_PROXY_HEALTH_URL_B ??
  "http://demo-api.local.proxy.localhost:18081/health";
const PROXY_HOST =
  process.env.LOCAL_PROXY_HOST ?? "demo-api.local.proxy.localhost";
const ADMIN_EMAIL =
  process.env.LOCAL_ADMIN_EMAIL ?? "admin@local.faremeter.test";
const ADMIN_PASSWORD = process.env.LOCAL_ADMIN_PASSWORD ?? "localdev123";
const EXPECTED_DEMO_PRICE = process.env.LOCAL_DEMO_PRICE ?? "1000";
const CHECK_ENDPOINT_PATH = `/v1/local-check/created-${Date.now()}`;
const DYNAMIC_FLEX_ENDPOINT_PATH = `/v1/local-check/dynamic-flex-${Date.now()}`;
const DYNAMIC_FLEX_RATE = "1000";
const DYNAMIC_FLEX_MAX_TOKENS = 10;
const DYNAMIC_FLEX_USAGE_TOKENS = 7;
const EXPECTED_DYNAMIC_FLEX_AUTHORIZE_AMOUNT = (
  BigInt(DYNAMIC_FLEX_MAX_TOKENS) * BigInt(DYNAMIC_FLEX_RATE)
).toString();
const EXPECTED_DYNAMIC_FLEX_CAPTURE_AMOUNT =
  BigInt(DYNAMIC_FLEX_USAGE_TOKENS) * BigInt(DYNAMIC_FLEX_RATE);
const SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const CLIENT_KEYPAIR_PATH =
  process.env.LOCAL_CLIENT_SOLANA_KEYPAIR_PATH ??
  "/workspace/marketplace/keypairs/client-devnet.json";
const FACILITATOR_KEYPAIR_PATH =
  process.env.LOCAL_FACILITATOR_SOLANA_KEYPAIR_PATH ??
  "/workspace/marketplace/keypairs/facilitator.json";

const rawSolanaCluster = process.env.SOLANA_NETWORK ?? "devnet";
if (!solana.isKnownCluster(rawSolanaCluster)) {
  throw new Error(
    `Unsupported SOLANA_NETWORK for local check: ${rawSolanaCluster}`,
  );
}

function getSolanaUsdc(cluster: solana.KnownCluster) {
  const token = solana.lookupKnownSPLToken(cluster, "USDC");
  if (!token) {
    throw new Error(`Couldn't look up USDC on Solana ${cluster}`);
  }
  return token;
}

const SOLANA_CLUSTER = rawSolanaCluster;
const SOLANA_USDC = getSolanaUsdc(SOLANA_CLUSTER);
const SOLANA_NETWORK_IDS = solana.getV1NetworkIds(SOLANA_CLUSTER);
const EXPECTED_SOLANA_NETWORKS = new Set([
  ...SOLANA_NETWORK_IDS,
  solana.normalizeNetworkId(SOLANA_CLUSTER),
]);

type LoginResponse = {
  user: {
    organizations: {
      id: number;
      slug: string;
    }[];
  };
};

type OrganizationTenant = {
  id: number;
  name: string;
  status: string;
  nodes: { id: number }[];
};

type TransactionRecord = {
  id: number;
  endpoint_id?: number | null;
  request_path?: string | null;
  amount?: number;
  metadata?: unknown;
};

type EndpointRecord = {
  id: number;
  path: string;
  path_pattern: string;
};

type EarningsAnalytics = {
  total_earned: number;
  current_month_earned: number;
  previous_month_earned: number;
  percent_change: number | null;
  total_transactions: number;
};

type AdminTransactionsResponse = {
  transactions: TransactionRecord[];
  total: number;
};

type PaymentRequirement = {
  network?: unknown;
  asset?: unknown;
  maxAmountRequired?: unknown;
  scheme?: unknown;
};

function controlPlaneHealthUrl(): string {
  return `${CONTROL_PLANE_BASE_URL}/health`;
}

function discoveryHealthUrl(): string {
  return `${DISCOVERY_BASE_URL}/health`;
}

async function waitFor(url: string, label: string): Promise<void> {
  const timeoutAt = Date.now() + 90_000;
  let lastError: unknown;

  while (Date.now() < timeoutAt) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`${label} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(`Timed out waiting for ${label}`, { cause: lastError });
}

async function apiJson<T>(
  path: string,
  authCookie: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Cookie", authCookie);

  const response = await fetch(`${CONTROL_PLANE_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `${init.method ?? "GET"} ${path} failed: ${response.status} ${text}`,
    );
  }

  return (await response.json()) as T;
}

async function login(): Promise<{
  authCookie: string;
  organizationId: number;
}> {
  const response = await fetch(`${CONTROL_PLANE_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Login failed: ${response.status} ${text}`);
  }

  const rawCookie = response.headers.get("set-cookie");
  if (!rawCookie) {
    throw new Error("Login succeeded but auth cookie was not returned");
  }

  const authCookie = rawCookie.split(";")[0];
  if (!authCookie) {
    throw new Error("Could not parse auth cookie from login response");
  }

  const body = (await response.json()) as LoginResponse;
  const organization = body.user.organizations.find(
    (org) => org.slug === "local",
  );
  if (!organization) {
    throw new Error("Local development organization was not found after login");
  }

  return {
    authCookie,
    organizationId: organization.id,
  };
}

async function findDemoTenant(
  organizationId: number,
  authCookie: string,
): Promise<OrganizationTenant> {
  const tenants = await apiJson<OrganizationTenant[]>(
    `/api/organizations/${organizationId}/tenants`,
    authCookie,
  );

  const tenant = tenants.find((item) => item.name === "demo-api");
  if (!tenant) {
    throw new Error("Demo tenant was not found in the local organization");
  }

  if (tenant.status !== "active") {
    throw new Error(`Demo tenant is not active yet (status=${tenant.status})`);
  }

  if (tenant.nodes.length < 2) {
    throw new Error(
      `Demo tenant expected 2 nodes, found ${tenant.nodes.length}`,
    );
  }

  return tenant;
}

async function getTransactionCount(
  tenantId: number,
  authCookie: string,
): Promise<number> {
  const transactions = await apiJson<TransactionRecord[]>(
    `/api/tenants/${tenantId}/transactions`,
    authCookie,
  );
  return transactions.length;
}

async function createFreeSmokeEndpoint(
  tenantId: number,
  authCookie: string,
): Promise<EndpointRecord> {
  const endpoint = await apiJson<EndpointRecord>(
    `/api/tenants/${tenantId}/endpoints`,
    authCookie,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: CHECK_ENDPOINT_PATH,
        price: 0,
        scheme: "flex",
        description:
          "Local free check endpoint created through the control plane",
        priority: 10,
        http_method: "POST",
        tags: ["local-check"],
      }),
    },
  );

  if (endpoint.path !== CHECK_ENDPOINT_PATH) {
    throw new Error(`Unexpected local check endpoint path: ${endpoint.path}`);
  }

  return endpoint;
}

function readKeypair(path: string): Uint8Array {
  return Uint8Array.from(
    JSON.parse(fs.readFileSync(path, "utf-8")) as number[],
  );
}

async function readKeypairSigner(path: string): Promise<KeyPairSigner> {
  return await createKeyPairSignerFromBytes(readKeypair(path));
}

async function importDynamicFlexSpec(
  tenantId: number,
  authCookie: string,
): Promise<void> {
  const facilitator = await readKeypairSigner(FACILITATOR_KEYPAIR_PATH);
  const spec = {
    openapi: "3.0.3",
    info: { title: "Local dynamic Flex smoke", version: "1.0.0" },
    "x-faremeter-assets": {
      "solana-devnet-USDC": {
        chain: solana.normalizeNetworkId(SOLANA_CLUSTER),
        token: SOLANA_USDC.address,
        decimals: 6,
        recipient: facilitator.address,
      },
    },
    "x-faremeter-pricing": {
      rates: {
        "solana-devnet-USDC": Number(DYNAMIC_FLEX_RATE),
      },
    },
    paths: {
      [DYNAMIC_FLEX_ENDPOINT_PATH]: {
        "x-faremeter-pricing": { scheme: "flex" },
        post: {
          summary: "Dynamic paid Flex route imported from OpenAPI",
          responses: { "200": { description: "OK" } },
          "x-faremeter-pricing": {
            rules: [
              {
                match: "$",
                authorize: "coalesce($.request.body.max_tokens, 10)",
                capture: "$.response.body.usage.total_tokens",
              },
            ],
          },
        },
      },
    },
  };

  await apiJson<unknown>(
    `/api/tenants/${tenantId}/openapi/import`,
    authCookie,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spec }),
    },
  );
}

async function waitForOpenApiPath(
  tenantId: number,
  authCookie: string,
  path: string,
): Promise<void> {
  const timeoutAt = Date.now() + 30_000;

  while (Date.now() < timeoutAt) {
    const response = await apiJson<{
      spec?: { paths?: Record<string, unknown> };
    }>(`/api/tenants/${tenantId}/openapi/spec`, authCookie);
    if (response.spec?.paths?.[path]) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for OpenAPI path ${path}`);
}

async function waitForTransactionCount(
  tenantId: number,
  authCookie: string,
  minimumCount: number,
): Promise<number> {
  const timeoutAt = Date.now() + 60_000;

  while (Date.now() < timeoutAt) {
    const count = await getTransactionCount(tenantId, authCookie);
    if (count >= minimumCount) {
      return count;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(
    `Timed out waiting for transactions to reach ${minimumCount} for tenant ${tenantId}`,
  );
}

async function waitForDynamicFlexTransaction(
  tenantId: number,
  authCookie: string,
): Promise<TransactionRecord> {
  const timeoutAt = Date.now() + 90_000;

  while (Date.now() < timeoutAt) {
    const transactions = await apiJson<TransactionRecord[]>(
      `/api/tenants/${tenantId}/transactions`,
      authCookie,
    );
    const found = transactions.find((tx) => {
      const metadata =
        typeof tx.metadata === "object" && tx.metadata !== null
          ? (tx.metadata as Record<string, unknown>)
          : {};
      return (
        tx.request_path === DYNAMIC_FLEX_ENDPOINT_PATH &&
        tx.amount === Number(EXPECTED_DYNAMIC_FLEX_CAPTURE_AMOUNT) &&
        metadata.scheme === "flex" &&
        metadata.settlementStatus === "pending_finalization" &&
        typeof metadata.authorizationId === "string"
      );
    });
    if (found) return found;

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(
    `Timed out waiting for dynamic Flex transaction on ${DYNAMIC_FLEX_ENDPOINT_PATH}`,
  );
}

async function waitForExactTransaction(
  tenantId: number,
  authCookie: string,
): Promise<TransactionRecord> {
  const timeoutAt = Date.now() + 90_000;

  while (Date.now() < timeoutAt) {
    const transactions = await apiJson<TransactionRecord[]>(
      `/api/tenants/${tenantId}/transactions`,
      authCookie,
    );
    const found = transactions.find(
      (tx) =>
        tx.request_path === "/v1/chat/completions" &&
        tx.amount === Number(EXPECTED_DEMO_PRICE) &&
        typeof tx.tx_hash === "string",
    );
    if (found) return found;

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error("Timed out waiting for exact transaction");
}

type ProxyResponse = {
  status: number;
  ok: boolean;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
};

function buildProxyBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    model: "local-demo",
    max_tokens: DYNAMIC_FLEX_MAX_TOKENS,
    messages: [{ role: "user", content: "hello" }],
    ...overrides,
  });
}

async function proxyRequest(
  urlString: string,
  body = buildProxyBody(),
): Promise<ProxyResponse> {
  const url = new URL(urlString);
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;

  return await new Promise<ProxyResponse>((resolve, reject) => {
    const req = request(
      url,
      {
        method: "POST",
        headers: {
          Host: PROXY_HOST,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body).toString(),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          const status = res.statusCode ?? 0;
          resolve({
            status,
            ok: status >= 200 && status < 300,
            text: async () => raw,
            json: async () => JSON.parse(raw) as unknown,
          });
        });
      },
    );

    req.on("error", reject);
    req.setTimeout(15_000, () => {
      req.destroy(new Error(`Proxy request timed out for ${urlString}`));
    });
    req.end(body);
  });
}

async function fetchWithHostHeader(
  input: string | URL | Request,
  init: RequestInit = {},
): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : input.toString());
  const body = init.body;
  if (
    body !== undefined &&
    body !== null &&
    typeof body !== "string" &&
    !Buffer.isBuffer(body)
  ) {
    throw new Error(
      "Proxy fetch only supports string or Buffer request bodies",
    );
  }
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;
  const headers = new Headers(init.headers);
  headers.set("Host", PROXY_HOST);
  if (body !== undefined && !headers.has("Content-Length")) {
    headers.set("Content-Length", Buffer.byteLength(body).toString());
  }

  return await new Promise<Response>((resolve, reject) => {
    const headerRecord: Record<string, string> = {};
    headers.forEach((value, key) => {
      headerRecord[key] = value;
    });

    const req = request(
      url,
      {
        method: init.method ?? "GET",
        headers: headerRecord,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on("end", () => {
          resolve(
            new Response(Buffer.concat(chunks), {
              status: res.statusCode ?? 0,
              headers: res.headers as Record<string, string>,
            }),
          );
        });
      },
    );

    req.on("error", reject);
    req.setTimeout(30_000, () => {
      req.destroy(new Error(`Proxy fetch timed out for ${url.toString()}`));
    });
    if (body !== undefined) req.end(body);
    else req.end();
  });
}

async function assertSuccessfulProxyCall(url: string): Promise<unknown> {
  const response = await proxyRequest(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Expected proxy call to succeed for ${url}, got ${response.status}: ${text}`,
    );
  }

  return await response.json();
}

function getAccepts(body: unknown): PaymentRequirement[] {
  if (typeof body !== "object" || body === null || !("accepts" in body)) {
    return [];
  }

  const accepts = body.accepts;
  if (!Array.isArray(accepts)) {
    return [];
  }

  return accepts.filter(
    (item): item is PaymentRequirement =>
      typeof item === "object" && item !== null,
  );
}

async function assertUnpaid(
  url: string,
  expectedAmount = EXPECTED_DEMO_PRICE,
  expectedScheme?: string,
): Promise<void> {
  const timeoutAt = Date.now() + 15_000;
  let response: ProxyResponse | null = null;
  while (Date.now() < timeoutAt) {
    response = await proxyRequest(url);
    if (response.status === 402) break;
    if (![404, 502, 503].includes(response.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  if (!response) {
    throw new Error(`Expected unpaid proxy call to return 402 for ${url}`);
  }

  if (response.status !== 402) {
    throw new Error(
      `Expected unpaid proxy call to return 402 for ${url}, got ${response.status}`,
    );
  }

  const body = await response.json();
  const accepts = getAccepts(body);
  const matching = accepts.find(
    (requirement) =>
      typeof requirement.network === "string" &&
      EXPECTED_SOLANA_NETWORKS.has(requirement.network) &&
      requirement.asset === SOLANA_USDC.address &&
      (expectedScheme === undefined || requirement.scheme === expectedScheme),
  );

  if (!matching) {
    throw new Error(
      `Expected 402 accepts to include ${SOLANA_CLUSTER} USDC ${SOLANA_USDC.address}`,
    );
  }

  if (matching.maxAmountRequired !== expectedAmount) {
    throw new Error(
      `Expected unpaid proxy to require ${expectedAmount} atomic USDC, got ${matching.maxAmountRequired}`,
    );
  }
}

function proxyUrlFor(baseUrl: string, path: string): string {
  const url = new URL(baseUrl);
  url.pathname = path;
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function confirmSignature(
  rpc: ReturnType<typeof createSolanaRpc>,
  sig: Signature,
): Promise<void> {
  for (let i = 0; i < 60; i++) {
    const { value: statuses } = await rpc.getSignatureStatuses([sig]).send();
    const status = statuses[0];
    if (
      status?.confirmationStatus === "confirmed" ||
      status?.confirmationStatus === "finalized"
    ) {
      if (status.err) {
        throw new Error(`transaction failed: ${JSON.stringify(status.err)}`);
      }
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`transaction confirmation timeout: ${sig}`);
}

async function sendInstructions(
  rpc: ReturnType<typeof createSolanaRpc>,
  feePayer: KeyPairSigner,
  instructions: Instruction[],
): Promise<Signature> {
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  const msg = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(feePayer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
  const signedTx = await signTransactionMessageWithSigners(msg);
  const wire = getBase64EncodedWireTransaction(signedTx);
  const sig = await rpc.sendTransaction(wire, { encoding: "base64" }).send();
  await confirmSignature(rpc, sig);
  return sig;
}

async function assertPaidDynamicFlexCall(url: string): Promise<{
  body: unknown;
  escrow: string;
  createEscrowSignature: string;
  depositSignature: string;
  registerSessionKeySignature: string;
}> {
  const rpc = createSolanaRpc(SOLANA_RPC_URL);
  const owner = await readKeypairSigner(CLIENT_KEYPAIR_PATH);
  const facilitator = await readKeypairSigner(FACILITATOR_KEYPAIR_PATH);
  const mint = address(SOLANA_USDC.address);

  const { value: tokenAccounts } = await rpc
    .getTokenAccountsByOwner(owner.address, { mint }, { encoding: "base64" })
    .send();
  const firstTokenAccount = tokenAccounts[0];
  if (!firstTokenAccount) {
    throw new Error(
      `payer ${owner.address} has no ${SOLANA_CLUSTER} USDC token account`,
    );
  }

  const createIx = await getCreateEscrowInstructionAsync({
    owner,
    index: Date.now(),
    facilitator: facilitator.address,
    refundTimeoutSlots: 150,
    deadmanTimeoutSlots: 100_000,
    maxSessionKeys: 10,
  });
  const createEscrowSignature = await sendInstructions(rpc, owner, [createIx]);
  const escrowAddress = createIx.accounts[1]?.address;
  if (!escrowAddress) {
    throw new Error("create escrow instruction missing escrow");
  }

  const depositIx = await getDepositInstructionAsync({
    depositor: owner,
    escrow: escrowAddress,
    mint,
    source: firstTokenAccount.pubkey,
    amount: BigInt(EXPECTED_DYNAMIC_FLEX_AUTHORIZE_AMOUNT),
  });
  const depositSignature = await sendInstructions(rpc, owner, [depositIx]);

  const sessionKeyPair = (await crypto.subtle.generateKey("Ed25519", true, [
    "sign",
    "verify",
  ])) as webcrypto.CryptoKeyPair;
  const sessionKeyAddress = await getAddressFromPublicKey(
    sessionKeyPair.publicKey,
  );
  const registerIx = await getRegisterSessionKeyInstructionAsync({
    owner,
    escrow: escrowAddress,
    sessionKey: sessionKeyAddress,
    expiresAtSlot: null,
    revocationGracePeriodSlots: 10,
  });
  const registerSessionKeySignature = await sendInstructions(rpc, owner, [
    registerIx,
  ]);

  const handler = createFlexPaymentHandler({
    network: SOLANA_CLUSTER,
    escrow: escrowAddress,
    mint,
    sessionKeyPair,
    sessionKeyAddress,
    rpc,
  });
  const paidFetch = wrapFetch(fetchWithHostHeader, { handlers: [handler] });
  const response = await paidFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: buildProxyBody(),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Expected paid dynamic Flex call to succeed for ${url}, got ${response.status}: ${text}`,
    );
  }

  await fetchEscrowAccount(rpc, escrowAddress);
  await findPendingSettlementsByEscrow(rpc, escrowAddress);

  return {
    body: JSON.parse(text) as unknown,
    escrow: escrowAddress,
    createEscrowSignature,
    depositSignature,
    registerSessionKeySignature,
  };
}

async function assertPaidExactCall(url: string): Promise<unknown> {
  const rpc = createSolanaRpc(SOLANA_RPC_URL);
  const owner = await readKeypairSigner(CLIENT_KEYPAIR_PATH);
  const mint = address(SOLANA_USDC.address);
  const handler = createExactPaymentHandler(
    {
      network: SOLANA_CLUSTER,
      publicKey: owner.address,
      partiallySignTransaction: async (tx) =>
        partiallySignTransaction([owner.keyPair], tx),
    },
    mint,
    rpc,
  );
  const paidFetch = wrapFetch(fetchWithHostHeader, { handlers: [handler] });
  const response = await paidFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: buildProxyBody(),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Expected paid exact call to succeed for ${url}, got ${response.status}: ${text}`,
    );
  }

  return JSON.parse(text) as unknown;
}

async function main() {
  await waitFor(controlPlaneHealthUrl(), "control-plane");
  await waitFor(discoveryHealthUrl(), "discovery");
  await waitFor(UI_URL, "control-plane-ui");
  await waitFor(PROXY_HEALTH_URL_A, "api-node-a");
  await waitFor(PROXY_HEALTH_URL_B, "api-node-b");

  const { authCookie, organizationId } = await login();
  const tenant = await findDemoTenant(organizationId, authCookie);
  const initialTransactionCount = await getTransactionCount(
    tenant.id,
    authCookie,
  );
  const createdEndpoint = await createFreeSmokeEndpoint(tenant.id, authCookie);
  await waitForOpenApiPath(tenant.id, authCookie, createdEndpoint.path);
  await importDynamicFlexSpec(tenant.id, authCookie);
  const createdProxyUrlA = proxyUrlFor(PROXY_URL_A, createdEndpoint.path);
  const createdProxyUrlB = proxyUrlFor(PROXY_URL_B, createdEndpoint.path);
  const dynamicFlexProxyUrlA = proxyUrlFor(
    PROXY_URL_A,
    DYNAMIC_FLEX_ENDPOINT_PATH,
  );

  await assertUnpaid(PROXY_URL_A);
  await assertUnpaid(PROXY_URL_B);
  await assertUnpaid(
    dynamicFlexProxyUrlA,
    EXPECTED_DYNAMIC_FLEX_AUTHORIZE_AMOUNT,
    "flex",
  );
  const paidExact = await assertPaidExactCall(PROXY_URL_A);
  const createdBodyA = await assertSuccessfulProxyCall(createdProxyUrlA);
  const createdBodyB = await assertSuccessfulProxyCall(createdProxyUrlB);
  const paidDynamicFlex = await assertPaidDynamicFlexCall(dynamicFlexProxyUrlA);
  const exactTransaction = await waitForExactTransaction(tenant.id, authCookie);
  const dynamicFlexTransaction = await waitForDynamicFlexTransaction(
    tenant.id,
    authCookie,
  );
  const finalTransactionCount = await waitForTransactionCount(
    tenant.id,
    authCookie,
    initialTransactionCount + 4,
  );
  const tenantAnalytics = await apiJson<EarningsAnalytics>(
    `/api/admin/tenants/${tenant.id}/analytics`,
    authCookie,
  );
  if (tenantAnalytics.total_transactions < finalTransactionCount) {
    throw new Error(
      `Expected admin tenant analytics to include at least ${finalTransactionCount} transactions, got ${tenantAnalytics.total_transactions}`,
    );
  }

  const adminTransactions = await apiJson<AdminTransactionsResponse>(
    "/api/admin/transactions?limit=25",
    authCookie,
  );
  if (adminTransactions.total < finalTransactionCount) {
    throw new Error(
      `Expected admin transactions total to include at least ${finalTransactionCount} transactions, found ${adminTransactions.total}`,
    );
  }

  process.stdout.write(
    JSON.stringify(
      {
        status: "ok",
        organizationId,
        tenantId: tenant.id,
        createdEndpointId: createdEndpoint.id,
        initialTransactionCount,
        finalTransactionCount,
        tenantAnalytics,
        exact: {
          expectedAmount: EXPECTED_DEMO_PRICE,
          transaction: exactTransaction,
          paid: paidExact,
        },
        createdNodeA: createdBodyA,
        createdNodeB: createdBodyB,
        dynamicFlex: {
          path: DYNAMIC_FLEX_ENDPOINT_PATH,
          expectedAuthorizeAmount: EXPECTED_DYNAMIC_FLEX_AUTHORIZE_AMOUNT,
          expectedCaptureAmount:
            EXPECTED_DYNAMIC_FLEX_CAPTURE_AMOUNT.toString(),
          transaction: dynamicFlexTransaction,
          paid: paidDynamicFlex,
        },
      },
      null,
      2,
    ),
  );
  process.stdout.write("\n");
}

await main();
