import PgBoss from "pg-boss";
import { triggerCertProvisioning } from "./cert.js";
import {
  deleteHealthCheck,
  deleteNodeDnsRecord,
  deleteAllTenantDnsRecords,
} from "./dns.js";
import { syncToNode } from "./sync.js";
import { fetchWalletBalances } from "./balances.js";
import { cleanupAccount } from "./corbits-dash.js";
import { logger } from "../logger.js";
import { db } from "../server.js";

let boss: PgBoss | null = null;

const CERT_PROVISIONING_QUEUE = "cert-provisioning";
const TENANT_DELETION_QUEUE = "tenant-deletion";
const BALANCE_CHECK_QUEUE = "balance-check";

interface CertProvisioningJob {
  nodeId: number;
  tenantName: string;
}

interface TenantDeletionJob {
  tenantId: number;
  tenantName: string;
}

interface BalanceCheckJob {
  walletId: number;
  solanaAddress: string;
}

export async function checkAndUpdateTenantStatus(
  tenantId: number,
): Promise<void> {
  const tenant = await db
    .selectFrom("tenants")
    .select(["id", "wallet_id", "status"])
    .where("id", "=", tenantId)
    .executeTakeFirst();

  if (!tenant || (tenant.status !== "pending" && tenant.status !== "failed")) {
    return;
  }

  const tenantNodes = await db
    .selectFrom("tenant_nodes")
    .select(["cert_status"])
    .where("tenant_id", "=", tenantId)
    .execute();

  let walletFunded = false;
  let walletFailed = false;

  if (tenant.wallet_id) {
    const wallet = await db
      .selectFrom("wallets")
      .select(["funding_status"])
      .where("id", "=", tenant.wallet_id)
      .executeTakeFirst();

    walletFunded = wallet?.funding_status === "funded";
    walletFailed = wallet?.funding_status === "failed";
  } else {
    logger.warn(
      `checkAndUpdateTenantStatus: Tenant ${tenantId} has no wallet assigned`,
    );
    return;
  }

  const allCertsProvisioned =
    tenantNodes.length === 0 ||
    tenantNodes.every((tn) => tn.cert_status === "provisioned");
  const anyCertFailed = tenantNodes.some((tn) => tn.cert_status === "failed");

  if (walletFunded && allCertsProvisioned) {
    await db
      .updateTable("tenants")
      .set({ status: "active" })
      .where("id", "=", tenantId)
      .execute();
    logger.info(`Tenant ${tenantId} status updated to active`);
  } else if (walletFailed || anyCertFailed) {
    await db
      .updateTable("tenants")
      .set({ status: "failed" })
      .where("id", "=", tenantId)
      .execute();
    logger.info(`Tenant ${tenantId} status updated to failed`);
  }
}

export async function startQueue(config: {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}): Promise<void> {
  boss = new PgBoss({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
  });

  boss.on("error", (error) => {
    logger.error(`pg-boss error: ${error}`);
  });

  await boss.start();
  logger.info("pg-boss started");

  await boss.createQueue(CERT_PROVISIONING_QUEUE);
  logger.info(`Created queue: ${CERT_PROVISIONING_QUEUE}`);

  await boss.createQueue(TENANT_DELETION_QUEUE);
  logger.info(`Created queue: ${TENANT_DELETION_QUEUE}`);

  await boss.createQueue(BALANCE_CHECK_QUEUE);
  logger.info(`Created queue: ${BALANCE_CHECK_QUEUE}`);

  await boss.work<CertProvisioningJob>(
    CERT_PROVISIONING_QUEUE,
    { batchSize: 1 },
    async (jobs) => {
      for (const job of jobs) {
        const { nodeId, tenantName } = job.data;
        logger.info(
          `Processing cert provisioning job ${job.id} for ${tenantName} on node ${nodeId}`,
        );

        const success = await triggerCertProvisioning(nodeId, tenantName);

        if (!success) {
          throw new Error(
            `Cert provisioning failed for ${tenantName} on node ${nodeId}`,
          );
        }
      }
    },
  );

  logger.info("Cert provisioning worker started");

  await boss.work<TenantDeletionJob>(
    TENANT_DELETION_QUEUE,
    { batchSize: 1 },
    async (jobs) => {
      for (const job of jobs) {
        const { tenantId, tenantName } = job.data;
        logger.info(
          `Processing tenant deletion job ${job.id} for ${tenantName}`,
        );

        try {
          // Get all tenant_nodes
          const tenantNodes = await db
            .selectFrom("tenant_nodes")
            .select(["node_id", "health_check_id"])
            .where("tenant_id", "=", tenantId)
            .execute();

          // Remove from each node sequentially
          for (const { node_id, health_check_id } of tenantNodes) {
            if (health_check_id) {
              await deleteHealthCheck(health_check_id).catch((err) =>
                logger.error(`Failed to delete health check: ${err}`),
              );
            }
            await deleteNodeDnsRecord(tenantName, node_id).catch((err) =>
              logger.error(`Failed to delete DNS record: ${err}`),
            );
            await db
              .deleteFrom("tenant_nodes")
              .where("tenant_id", "=", tenantId)
              .where("node_id", "=", node_id)
              .execute();
            await syncToNode(node_id).catch((err) =>
              logger.error(`Failed to sync to node: ${err}`),
            );
          }

          // Delete all tenant DNS records
          await deleteAllTenantDnsRecords(tenantName).catch((err) =>
            logger.error(
              `Failed to delete DNS for tenant ${tenantName}: ${err}`,
            ),
          );

          await cleanupAccount(tenantName);

          await db.deleteFrom("tenants").where("id", "=", tenantId).execute();

          logger.info(`Tenant ${tenantName} deleted successfully`);
        } catch (error) {
          logger.error(`Tenant deletion failed for ${tenantName}: ${error}`);

          // Reset status to active so user can retry
          await db
            .updateTable("tenants")
            .set({ status: "active" })
            .where("id", "=", tenantId)
            .execute();

          throw error;
        }
      }
    },
  );

  logger.info("Tenant deletion worker started");

  await boss.work<BalanceCheckJob>(
    BALANCE_CHECK_QUEUE,
    { batchSize: 1 },
    async (jobs) => {
      for (const job of jobs) {
        const { walletId, solanaAddress } = job.data;
        logger.info(
          `Processing balance check job ${job.id} for wallet ${walletId}`,
        );

        try {
          // Get minimum balance thresholds from admin settings
          const adminSettings = await db
            .selectFrom("admin_settings")
            .select(["minimum_balance_sol", "minimum_balance_usdc"])
            .where("id", "=", 1)
            .executeTakeFirst();

          const minSol = adminSettings?.minimum_balance_sol ?? 0.001;
          const minUsdc = adminSettings?.minimum_balance_usdc ?? 0.01;

          // Fetch wallet balance
          const balances = await fetchWalletBalances({
            solana: solanaAddress,
            evm: null,
          });

          const solBalance = parseFloat(balances.solana.native);
          const usdcBalance = parseFloat(balances.solana.usdc);
          logger.info(
            `Wallet ${walletId} balance: ${solBalance} SOL, ${usdcBalance} USDC (min: ${minSol} SOL, ${minUsdc} USDC)`,
          );

          if (solBalance >= minSol && usdcBalance >= minUsdc) {
            // Update wallet funding_status to 'funded'
            await db
              .updateTable("wallets")
              .set({ funding_status: "funded" })
              .where("id", "=", walletId)
              .execute();

            // Update all tenants using this wallet
            const tenants = await db
              .selectFrom("tenants")
              .select(["id"])
              .where("wallet_id", "=", walletId)
              .execute();

            for (const tenant of tenants) {
              await checkAndUpdateTenantStatus(tenant.id);
            }

            logger.info(`Wallet ${walletId} marked as funded`);
          } else {
            // Re-enqueue balance check with delay
            logger.info(
              `Wallet ${walletId} not yet funded, re-enqueueing check`,
            );
            if (!boss) {
              throw new Error("Queue not initialized");
            }
            await boss.send(
              BALANCE_CHECK_QUEUE,
              { walletId, solanaAddress },
              {
                retryLimit: 0,
                startAfter: 30, // Check again in 30 seconds
              },
            );
          }
        } catch (error) {
          logger.error(`Balance check failed for wallet ${walletId}: ${error}`);
          throw error;
        }
      }
    },
  );

  logger.info("Balance check worker started");
}

export async function stopQueue(): Promise<void> {
  if (boss) {
    await boss.stop();
    logger.info("pg-boss stopped");
  }
}

export async function enqueueCertProvisioning(
  nodeId: number,
  tenantName: string,
): Promise<void> {
  if (!boss) {
    throw new Error("Queue not initialized");
  }

  const tenant = await db
    .selectFrom("tenants")
    .select(["id"])
    .where("name", "=", tenantName)
    .executeTakeFirst();

  if (tenant) {
    await db
      .updateTable("tenant_nodes")
      .set({ cert_status: "pending" })
      .where("tenant_id", "=", tenant.id)
      .where("node_id", "=", nodeId)
      .execute();
  }

  const jobId = await boss.send(
    CERT_PROVISIONING_QUEUE,
    { nodeId, tenantName },
    {
      retryLimit: 3,
      retryDelay: 60,
      retryBackoff: true,
      expireInSeconds: 300,
    },
  );

  if (!jobId) {
    throw new Error(
      `Failed to enqueue cert provisioning for ${tenantName} on node ${nodeId}`,
    );
  }

  logger.info(
    `Enqueued cert provisioning job ${jobId} for ${tenantName} on node ${nodeId}`,
  );
}

export async function enqueueTenantDeletion(
  tenantId: number,
  tenantName: string,
): Promise<void> {
  if (!boss) {
    throw new Error("Queue not initialized");
  }

  const jobId = await boss.send(
    TENANT_DELETION_QUEUE,
    { tenantId, tenantName },
    {
      retryLimit: 3,
      retryDelay: 60,
      retryBackoff: true,
      expireInSeconds: 600,
    },
  );

  if (!jobId) {
    throw new Error(`Failed to enqueue tenant deletion for ${tenantName}`);
  }

  logger.info(`Enqueued tenant deletion job ${jobId} for ${tenantName}`);
}

export async function enqueueBalanceCheck(
  walletId: number,
  solanaAddress: string,
): Promise<void> {
  if (!boss) {
    throw new Error("Queue not initialized");
  }

  const jobId = await boss.send(
    BALANCE_CHECK_QUEUE,
    { walletId, solanaAddress },
    {
      retryLimit: 3,
      retryDelay: 30,
      retryBackoff: true,
      expireInSeconds: 600,
    },
  );

  if (!jobId) {
    throw new Error(`Failed to enqueue balance check for wallet ${walletId}`);
  }

  logger.info(
    `Enqueued balance check job ${jobId} for wallet ${walletId} (${solanaAddress})`,
  );
}
