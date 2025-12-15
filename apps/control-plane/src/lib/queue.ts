import PgBoss from "pg-boss";
import { triggerCertProvisioning } from "./cert.js";
import { transferSol, transferUsdcSol } from "./solana-transfers.js";
import { decryptWalletKeys } from "./crypto.js";
import {
  deleteHealthCheck,
  deleteNodeDnsRecord,
  deleteAllTenantDnsRecords,
} from "./dns.js";
import { syncToNode } from "./sync.js";
import { logger } from "../logger.js";
import { db } from "../server.js";

interface DecryptedWalletConfig {
  solana?: { "mainnet-beta"?: { address: string; key: string } };
}

let boss: PgBoss | null = null;

const CERT_PROVISIONING_QUEUE = "cert-provisioning";
const WALLET_FUNDING_QUEUE = "wallet-funding";
const TENANT_DELETION_QUEUE = "tenant-deletion";

interface CertProvisioningJob {
  nodeId: number;
  tenantName: string;
}

interface WalletFundingJob {
  tenantId: number;
  solanaAddress: string;
  solAmount: number;
  usdcAmount: number;
}

interface TenantDeletionJob {
  tenantId: number;
  tenantName: string;
}

export async function checkAndUpdateTenantStatus(
  tenantId: number,
): Promise<void> {
  const tenant = await db
    .selectFrom("tenants")
    .select(["id", "wallet_status", "status"])
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

  const walletFunded = tenant.wallet_status === "funded";
  const walletFailed = tenant.wallet_status === "failed";
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

  await boss.createQueue(WALLET_FUNDING_QUEUE);
  logger.info(`Created queue: ${WALLET_FUNDING_QUEUE}`);

  await boss.createQueue(TENANT_DELETION_QUEUE);
  logger.info(`Created queue: ${TENANT_DELETION_QUEUE}`);

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

  await boss.work<WalletFundingJob>(
    WALLET_FUNDING_QUEUE,
    { batchSize: 1 },
    async (jobs) => {
      for (const job of jobs) {
        const { tenantId, solanaAddress, solAmount, usdcAmount } = job.data;
        logger.info(
          `Processing wallet funding job ${job.id} for tenant ${tenantId}`,
        );

        try {
          // Get master wallet from admin_settings
          const adminSettings = await db
            .selectFrom("admin_settings")
            .select(["wallet_config"])
            .where("id", "=", 1)
            .executeTakeFirst();

          if (!adminSettings?.wallet_config) {
            throw new Error("Master wallet not configured");
          }

          const walletConfig = decryptWalletKeys(
            adminSettings.wallet_config as Record<string, unknown>,
          ) as DecryptedWalletConfig;
          const masterKey = walletConfig.solana?.["mainnet-beta"]?.key;

          if (!masterKey) {
            throw new Error("Master Solana wallet key not found");
          }

          // Transfer SOL
          logger.info(`Transferring ${solAmount} SOL to ${solanaAddress}`);
          await transferSol(masterKey, solanaAddress, solAmount);

          // Transfer USDC
          logger.info(`Transferring ${usdcAmount} USDC to ${solanaAddress}`);
          await transferUsdcSol(masterKey, solanaAddress, usdcAmount);

          // Update tenant wallet_status to 'funded'
          await db
            .updateTable("tenants")
            .set({ wallet_status: "funded" })
            .where("id", "=", tenantId)
            .execute();

          // Check if tenant can transition to active
          await checkAndUpdateTenantStatus(tenantId);

          logger.info(`Wallet funding completed for tenant ${tenantId}`);
        } catch (error) {
          logger.error(
            `Wallet funding failed for tenant ${tenantId}: ${error}`,
          );

          // Update tenant wallet_status to 'failed'
          await db
            .updateTable("tenants")
            .set({ wallet_status: "failed" })
            .where("id", "=", tenantId)
            .execute();

          // Check if tenant should transition to failed
          await checkAndUpdateTenantStatus(tenantId);

          throw error;
        }
      }
    },
  );

  logger.info("Wallet funding worker started");

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

          // Finally delete the tenant
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

export async function enqueueWalletFunding(
  tenantId: number,
  solanaAddress: string,
  solAmount: number,
  usdcAmount: number,
): Promise<void> {
  if (!boss) {
    throw new Error("Queue not initialized");
  }

  const jobId = await boss.send(
    WALLET_FUNDING_QUEUE,
    { tenantId, solanaAddress, solAmount, usdcAmount },
    {
      retryLimit: 3,
      retryDelay: 60,
      retryBackoff: true,
      expireInSeconds: 600,
    },
  );

  if (!jobId) {
    throw new Error(`Failed to enqueue wallet funding for tenant ${tenantId}`);
  }

  logger.info(
    `Enqueued wallet funding job ${jobId} for tenant ${tenantId} (${solanaAddress})`,
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
