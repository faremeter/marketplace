import PgBoss from "pg-boss";
import {
  triggerCertProvisioning,
  deleteCertOnNode,
  deleteLocalCert,
} from "./cert.js";
import {
  createHealthCheck,
  deleteHealthCheck,
  upsertNodeDnsRecord,
  deleteNodeDnsRecord,
  deleteAllTenantDnsRecords,
} from "./dns.js";
import { syncToNode } from "./sync.js";
import { fetchWalletBalances } from "./balances.js";
import { cleanupAccount, renameAccount } from "./corbits-dash.js";
import { logger } from "../logger.js";
import { db } from "../db/instance.js";

let boss: PgBoss | null = null;

const CERT_PROVISIONING_QUEUE = "cert-provisioning";
const TENANT_DELETION_QUEUE = "tenant-deletion";
const TENANT_RENAME_QUEUE = "tenant-rename";
const BALANCE_CHECK_QUEUE = "balance-check";
const TRANSACTION_RECORDING_QUEUE = "transaction-recording";

interface CertProvisioningJob {
  nodeIds: number[];
  tenantName: string;
}

interface TenantDeletionJob {
  tenantId: number;
  tenantName: string;
}

interface TenantRenameJob {
  tenantId: number;
  oldName: string;
  newName: string;
}

interface BalanceCheckJob {
  walletId: number;
  solanaAddress: string;
}

export interface TransactionRecordingJob {
  ngx_request_id: string;
  tx_hash: string | null;
  tenant_id: number;
  organization_id: number | null;
  endpoint_id: number | null;
  amount_usdc: number;
  network: string | null;
  request_path: string;
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

  const certStatuses = tenantNodes.map((tn) => tn.cert_status);
  const allCertsProvisioned =
    tenantNodes.length === 0 ||
    tenantNodes.every((tn) => tn.cert_status === "provisioned");
  const anyCertFailed = tenantNodes.some((tn) => tn.cert_status === "failed");
  const allCertsFinalized =
    tenantNodes.length === 0 ||
    tenantNodes.every(
      (tn) => tn.cert_status === "provisioned" || tn.cert_status === "failed",
    );

  logger.debug(
    `checkAndUpdateTenantStatus: tenant=${tenantId} walletFunded=${walletFunded} walletFailed=${walletFailed} certStatuses=${JSON.stringify(certStatuses)} allCertsProvisioned=${allCertsProvisioned} anyCertFailed=${anyCertFailed} allCertsFinalized=${allCertsFinalized}`,
  );

  if (walletFunded && allCertsProvisioned) {
    await db
      .updateTable("tenants")
      .set({ status: "active", is_active: true })
      .where("id", "=", tenantId)
      .execute();

    const tenantNodeIds = await db
      .selectFrom("tenant_nodes")
      .select("node_id")
      .where("tenant_id", "=", tenantId)
      .execute();
    for (const tn of tenantNodeIds) {
      syncToNode(tn.node_id).catch((err) => logger.error(String(err)));
    }

    logger.info(`Tenant ${tenantId} status updated to active`);
  } else if (walletFailed || (allCertsFinalized && anyCertFailed)) {
    // Only mark as failed if wallet failed, or ALL certs have reached final state and at least one failed
    await db
      .updateTable("tenants")
      .set({ status: "failed" })
      .where("id", "=", tenantId)
      .execute();
    logger.info(
      `Tenant ${tenantId} status updated to failed (walletFailed=${walletFailed}, anyCertFailed=${anyCertFailed}, allCertsFinalized=${allCertsFinalized}, certStatuses=${JSON.stringify(certStatuses)})`,
    );
  }
}

export async function startQueue(config: {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
}): Promise<void> {
  boss = new PgBoss({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
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

  await boss.createQueue(TENANT_RENAME_QUEUE);
  logger.info(`Created queue: ${TENANT_RENAME_QUEUE}`);

  await boss.createQueue(BALANCE_CHECK_QUEUE);
  logger.info(`Created queue: ${BALANCE_CHECK_QUEUE}`);

  await boss.createQueue(TRANSACTION_RECORDING_QUEUE);
  logger.info(`Created queue: ${TRANSACTION_RECORDING_QUEUE}`);

  await boss.work<CertProvisioningJob>(
    CERT_PROVISIONING_QUEUE,
    { batchSize: 1 },
    async (jobs) => {
      for (const job of jobs) {
        const { nodeIds, tenantName } = job.data;
        logger.info(
          `Processing cert provisioning job ${job.id} for ${tenantName} on nodes [${nodeIds.join(", ")}]`,
        );

        const success = await triggerCertProvisioning(nodeIds, tenantName);

        if (!success) {
          throw new Error(
            `Cert provisioning failed for ${tenantName} on nodes [${nodeIds.join(", ")}]`,
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
          const tenantNodes = await db
            .selectFrom("tenant_nodes")
            .select(["node_id", "health_check_id"])
            .where("tenant_id", "=", tenantId)
            .execute();

          await db
            .updateTable("tenants")
            .set({ is_active: false })
            .where("id", "=", tenantId)
            .execute();

          await Promise.all(
            tenantNodes.map(({ node_id }) =>
              syncToNode(node_id).catch((err) =>
                logger.error(
                  `Failed to sync deactivation to node ${node_id}: ${err}`,
                ),
              ),
            ),
          );

          for (const { node_id, health_check_id } of tenantNodes) {
            if (health_check_id) {
              await deleteHealthCheck(health_check_id).catch((err) =>
                logger.error(`Failed to delete health check: ${err}`),
              );
            }
            await deleteNodeDnsRecord(tenantName, node_id).catch((err) =>
              logger.error(`Failed to delete DNS record: ${err}`),
            );
            await deleteCertOnNode(node_id, tenantName).catch((err) =>
              logger.error(`Failed to delete cert on node ${node_id}: ${err}`),
            );
            await db
              .deleteFrom("tenant_nodes")
              .where("tenant_id", "=", tenantId)
              .where("node_id", "=", node_id)
              .execute();
          }

          await deleteAllTenantDnsRecords(tenantName).catch((err) =>
            logger.error(
              `Failed to delete DNS for tenant ${tenantName}: ${err}`,
            ),
          );

          await cleanupAccount(tenantName);
          await deleteLocalCert(tenantName);

          await db.deleteFrom("tenants").where("id", "=", tenantId).execute();

          logger.info(`Tenant ${tenantName} deleted successfully`);
        } catch (error) {
          logger.error(`Tenant deletion failed for ${tenantName}: ${error}`);

          await db
            .updateTable("tenants")
            .set({ status: "active", is_active: true })
            .where("id", "=", tenantId)
            .execute();

          throw error;
        }
      }
    },
  );

  logger.info("Tenant deletion worker started");

  await boss.work<TenantRenameJob>(
    TENANT_RENAME_QUEUE,
    { batchSize: 1 },
    async (jobs) => {
      for (const job of jobs) {
        const { tenantId, oldName, newName } = job.data;
        logger.info(
          `Processing tenant rename job ${job.id}: ${oldName} -> ${newName}`,
        );

        try {
          const tenantNodes = await db
            .selectFrom("tenant_nodes")
            .innerJoin("nodes", "nodes.id", "tenant_nodes.node_id")
            .select([
              "tenant_nodes.node_id",
              "tenant_nodes.health_check_id",
              "nodes.public_ip",
              "nodes.status",
            ])
            .where("tenant_nodes.tenant_id", "=", tenantId)
            .execute();

          await db
            .updateTable("tenants")
            .set({ is_active: false })
            .where("id", "=", tenantId)
            .execute();

          for (const tn of tenantNodes) {
            await syncToNode(tn.node_id).catch((err) =>
              logger.error(
                `Failed to sync deactivation to node ${tn.node_id}: ${err}`,
              ),
            );
          }

          await new Promise((resolve) => setTimeout(resolve, 2000));

          const oldHealthCheckIds: string[] = [];

          for (const tn of tenantNodes) {
            if (!tn.public_ip) continue;

            const newHealthCheckId = await createHealthCheck(
              newName,
              tn.public_ip,
            );

            await upsertNodeDnsRecord(
              newName,
              tn.node_id,
              tn.public_ip,
              newHealthCheckId,
            );

            if (tn.health_check_id) {
              oldHealthCheckIds.push(tn.health_check_id);
            }

            await db
              .updateTable("tenant_nodes")
              .set({ health_check_id: newHealthCheckId })
              .where("tenant_id", "=", tenantId)
              .where("node_id", "=", tn.node_id)
              .execute();
          }

          await db
            .updateTable("tenants")
            .set({ name: newName })
            .where("id", "=", tenantId)
            .execute();

          for (const tn of tenantNodes) {
            await syncToNode(tn.node_id).catch((err) =>
              logger.error(`Failed to sync to node ${tn.node_id}: ${err}`),
            );
          }

          const activeNodeIds = tenantNodes
            .filter((tn) => tn.status === "active")
            .map((tn) => tn.node_id);

          if (activeNodeIds.length > 0) {
            try {
              await enqueueCertProvisioning(activeNodeIds, newName);
            } catch (err) {
              logger.error(
                `Failed to enqueue cert provisioning for nodes [${activeNodeIds.join(", ")}]: ${err}`,
              );
            }
          }

          for (const tn of tenantNodes) {
            await deleteNodeDnsRecord(oldName, tn.node_id).catch((err) =>
              logger.error(`Failed to delete old DNS record: ${err}`),
            );
          }

          for (const healthCheckId of oldHealthCheckIds) {
            await deleteHealthCheck(healthCheckId).catch((err) =>
              logger.error(`Failed to delete old health check: ${err}`),
            );
          }

          await renameAccount(oldName, newName).catch((err) =>
            logger.error(
              `Failed to rename Corbits account from ${oldName} to ${newName}: ${err}`,
            ),
          );

          if (activeNodeIds.length === 0) {
            await db
              .updateTable("tenants")
              .set({ status: "active", is_active: true })
              .where("id", "=", tenantId)
              .execute();

            for (const tn of tenantNodes) {
              syncToNode(tn.node_id).catch((err) => logger.error(String(err)));
            }

            logger.info(
              `Tenant renamed from ${oldName} to ${newName} (no certs needed)`,
            );
          } else {
            logger.info(
              `Tenant renamed from ${oldName} to ${newName}, awaiting cert provisioning for ${activeNodeIds.length} node(s)`,
            );
          }
        } catch (error) {
          logger.error(
            `Tenant rename failed for ${oldName} -> ${newName}: ${error}`,
          );

          await db
            .updateTable("tenants")
            .set({ status: "active", is_active: true })
            .where("id", "=", tenantId)
            .execute();

          const nodes = await db
            .selectFrom("tenant_nodes")
            .select("node_id")
            .where("tenant_id", "=", tenantId)
            .execute();
          for (const n of nodes) {
            syncToNode(n.node_id).catch((err) => logger.error(String(err)));
          }

          throw error;
        }
      }
    },
  );

  logger.info("Tenant rename worker started");

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

  await boss.work<TransactionRecordingJob>(
    TRANSACTION_RECORDING_QUEUE,
    { batchSize: 10 },
    async (jobs) => {
      for (const job of jobs) {
        const {
          ngx_request_id,
          tx_hash,
          tenant_id,
          organization_id,
          endpoint_id,
          amount_usdc,
          network,
          request_path,
        } = job.data;

        try {
          await db
            .insertInto("transactions")
            .values({
              ngx_request_id,
              tx_hash,
              tenant_id,
              organization_id,
              endpoint_id,
              amount_usdc,
              network,
              request_path,
            })
            .onConflict((oc) => oc.column("ngx_request_id").doNothing())
            .execute();

          logger.info(
            `Recorded transaction ${ngx_request_id} for tenant ${tenant_id}`,
          );
        } catch (error) {
          logger.error(
            `Failed to record transaction ${ngx_request_id}: ${error}`,
          );
          throw error;
        }
      }
    },
  );

  logger.info("Transaction recording worker started");
}

export async function stopQueue(): Promise<void> {
  if (boss) {
    await boss.stop();
    logger.info("pg-boss stopped");
  }
}

export async function enqueueCertProvisioning(
  nodeIds: number[],
  tenantName: string,
): Promise<void> {
  if (!boss) {
    throw new Error("Queue not initialized");
  }

  if (nodeIds.length === 0) {
    logger.warn(`enqueueCertProvisioning: No nodes provided for ${tenantName}`);
    return;
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
      .where("node_id", "in", nodeIds)
      .execute();
  }

  const jobId = await boss.send(
    CERT_PROVISIONING_QUEUE,
    { nodeIds, tenantName },
    {
      retryLimit: 3,
      retryDelay: 60,
      retryBackoff: true,
      expireInSeconds: 300,
    },
  );

  if (!jobId) {
    throw new Error(
      `Failed to enqueue cert provisioning for ${tenantName} on nodes [${nodeIds.join(", ")}]`,
    );
  }

  logger.info(
    `Enqueued cert provisioning job ${jobId} for ${tenantName} on nodes [${nodeIds.join(", ")}]`,
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

export async function enqueueTenantRename(
  tenantId: number,
  oldName: string,
  newName: string,
): Promise<void> {
  if (!boss) {
    throw new Error("Queue not initialized");
  }

  const jobId = await boss.send(
    TENANT_RENAME_QUEUE,
    { tenantId, oldName, newName },
    {
      retryLimit: 3,
      retryDelay: 60,
      retryBackoff: true,
      expireInSeconds: 600,
    },
  );

  if (!jobId) {
    throw new Error(
      `Failed to enqueue tenant rename for ${oldName} -> ${newName}`,
    );
  }

  logger.info(`Enqueued tenant rename job ${jobId}: ${oldName} -> ${newName}`);
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

export async function enqueueTransactionRecording(
  data: TransactionRecordingJob,
): Promise<void> {
  if (!boss) {
    throw new Error("Queue not initialized");
  }

  const jobId = await boss.send(TRANSACTION_RECORDING_QUEUE, data, {
    retryLimit: 3,
    retryDelay: 5,
    retryBackoff: true,
    expireInSeconds: 300,
  });

  if (!jobId) {
    throw new Error(
      `Failed to enqueue transaction recording for ${data.tx_hash}`,
    );
  }

  logger.info(
    `Enqueued transaction recording job ${jobId} for ${data.tx_hash}`,
  );
}
