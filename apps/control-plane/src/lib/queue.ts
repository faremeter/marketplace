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
import { fetchWalletBalances, extractAddresses } from "./balances.js";
import { cleanupAccount, renameAccount } from "./corbits-dash.js";
import { logger } from "../logger.js";
import { db } from "../db/instance.js";
import { toDomainInfo, buildTenantDomain } from "./domain.js";
import { sendEmail, type EmailType, type EmailTemplateVars } from "./email.js";

let boss: PgBoss | null = null;

const CERT_PROVISIONING_QUEUE = "cert-provisioning";
const TENANT_DELETION_QUEUE = "tenant-deletion";
const TENANT_RENAME_QUEUE = "tenant-rename";
const BALANCE_CHECK_QUEUE = "balance-check";
const BALANCE_AUDIT_QUEUE = "balance-audit";
const TRANSACTION_RECORDING_QUEUE = "transaction-recording";
const EMAIL_QUEUE = "email-send";

interface CertProvisioningJob {
  nodeIds: number[];
  tenantName: string;
  orgSlug: string | null;
}

interface TenantDeletionJob {
  tenantId: number;
  tenantName: string;
  orgSlug: string | null;
}

interface TenantRenameJob {
  tenantId: number;
  oldName: string;
  newName: string;
  oldOrgSlug: string | null;
  newOrgSlug: string | null;
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
  client_ip: string | null;
  request_method: string | null;
  metadata: Record<string, unknown> | null;
}

interface EmailJob {
  to: string;
  type: EmailType;
  variables: EmailTemplateVars[EmailType];
}

export async function checkAndUpdateTenantStatus(
  tenantId: number,
): Promise<void> {
  const tenant = await db
    .selectFrom("tenants")
    .select(["id", "wallet_id", "status"])
    .where("id", "=", tenantId)
    .executeTakeFirst();

  if (
    !tenant ||
    tenant.status === "registered" ||
    (tenant.status !== "pending" && tenant.status !== "failed")
  ) {
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

  await boss.createQueue(EMAIL_QUEUE);
  logger.info(`Created queue: ${EMAIL_QUEUE}`);

  await boss.createQueue(BALANCE_AUDIT_QUEUE);
  logger.info(`Created queue: ${BALANCE_AUDIT_QUEUE}`);

  await boss.schedule(
    BALANCE_AUDIT_QUEUE,
    "*/5 * * * *",
    {},
    {
      tz: "UTC",
    },
  );
  logger.info(`Scheduled ${BALANCE_AUDIT_QUEUE} to run every 5 minutes`);

  await boss.work<CertProvisioningJob>(
    CERT_PROVISIONING_QUEUE,
    { batchSize: 1 },
    async (jobs) => {
      for (const job of jobs) {
        const { nodeIds, tenantName, orgSlug } = job.data;
        const domainInfo = toDomainInfo({
          name: tenantName,
          org_slug: orgSlug,
        });
        logger.info(
          `Processing cert provisioning job ${job.id} for ${tenantName} on nodes [${nodeIds.join(", ")}]`,
        );

        const success = await triggerCertProvisioning(nodeIds, domainInfo);

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
        const { tenantId, tenantName, orgSlug } = job.data;
        const domainInfo = toDomainInfo({
          name: tenantName,
          org_slug: orgSlug,
        });
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
            await deleteNodeDnsRecord(domainInfo, node_id).catch((err) =>
              logger.error(`Failed to delete DNS record: ${err}`),
            );
            await deleteCertOnNode(node_id, domainInfo).catch((err) =>
              logger.error(`Failed to delete cert on node ${node_id}: ${err}`),
            );
            await db
              .deleteFrom("tenant_nodes")
              .where("tenant_id", "=", tenantId)
              .where("node_id", "=", node_id)
              .execute();
          }

          await deleteAllTenantDnsRecords(domainInfo).catch((err) =>
            logger.error(
              `Failed to delete DNS for tenant ${tenantName}: ${err}`,
            ),
          );

          await cleanupAccount(tenantName);
          await deleteLocalCert(domainInfo);

          await db
            .deleteFrom("transactions")
            .where("tenant_id", "=", tenantId)
            .execute();
          await db
            .deleteFrom("endpoints")
            .where("tenant_id", "=", tenantId)
            .execute();

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
        const { tenantId, oldName, newName, oldOrgSlug, newOrgSlug } = job.data;
        const oldDomainInfo = toDomainInfo({
          name: oldName,
          org_slug: oldOrgSlug,
        });
        const newDomainInfo = toDomainInfo({
          name: newName,
          org_slug: newOrgSlug,
        });
        const oldDomain = buildTenantDomain(oldDomainInfo);
        const newDomain = buildTenantDomain(newDomainInfo);
        logger.info(
          `Processing tenant rename job ${job.id}: ${oldDomain} -> ${newDomain}`,
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
              newDomainInfo,
              tn.public_ip,
            );

            await upsertNodeDnsRecord(
              newDomainInfo,
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
              await enqueueCertProvisioning(activeNodeIds, newName, newOrgSlug);
            } catch (err) {
              logger.error(
                `Failed to enqueue cert provisioning for nodes [${activeNodeIds.join(", ")}]: ${err}`,
              );
            }
          }

          for (const tn of tenantNodes) {
            await deleteNodeDnsRecord(oldDomainInfo, tn.node_id).catch((err) =>
              logger.error(`Failed to delete old DNS record: ${err}`),
            );
          }

          for (const healthCheckId of oldHealthCheckIds) {
            await deleteHealthCheck(healthCheckId).catch((err) =>
              logger.error(`Failed to delete old health check: ${err}`),
            );
          }

          if (oldName !== newName) {
            await renameAccount(oldName, newName).catch((err) =>
              logger.error(
                `Failed to rename Corbits account from ${oldName} to ${newName}: ${err}`,
              ),
            );
          }

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
              `Tenant domain changed: ${oldDomain} -> ${newDomain} (no certs needed)`,
            );
          } else {
            logger.info(
              `Tenant domain changed: ${oldDomain} -> ${newDomain}, awaiting cert provisioning for ${activeNodeIds.length} node(s)`,
            );
          }
        } catch (error) {
          logger.error(
            `Tenant rename failed: ${oldDomain} -> ${newDomain}: ${error}`,
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
          const adminSettings = await db
            .selectFrom("admin_settings")
            .select(["minimum_balance_sol", "minimum_balance_usdc"])
            .where("id", "=", 1)
            .executeTakeFirst();

          const minSol = adminSettings?.minimum_balance_sol ?? 0.001;
          const minUsdc = adminSettings?.minimum_balance_usdc ?? 0.01;

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
            await db
              .updateTable("wallets")
              .set({ funding_status: "funded" })
              .where("id", "=", walletId)
              .execute();

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

  await boss.work(BALANCE_AUDIT_QUEUE, { batchSize: 1 }, async () => {
    logger.info("Running periodic balance audit");

    try {
      const adminSettings = await db
        .selectFrom("admin_settings")
        .select(["minimum_balance_sol", "minimum_balance_usdc"])
        .where("id", "=", 1)
        .executeTakeFirst();

      const minSol = adminSettings?.minimum_balance_sol ?? 0.001;
      const minUsdc = adminSettings?.minimum_balance_usdc ?? 0.01;

      const fundedWallets = await db
        .selectFrom("wallets")
        .select(["id", "wallet_config"])
        .where("funding_status", "=", "funded")
        .execute();

      let checkedCount = 0;
      let unfundedCount = 0;

      for (const wallet of fundedWallets) {
        const config = wallet.wallet_config as Record<string, unknown> | null;
        const addresses = extractAddresses(config);

        if (!addresses.solana) {
          continue;
        }

        if (checkedCount > 0) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        checkedCount++;

        try {
          const balances = await fetchWalletBalances({
            solana: addresses.solana,
            evm: null,
          });

          const solBalance = parseFloat(balances.solana.native);
          const usdcBalance = parseFloat(balances.solana.usdc);

          if (solBalance < minSol || usdcBalance < minUsdc) {
            logger.warn(
              `Wallet ${wallet.id} balance dropped below minimum: ${solBalance} SOL, ${usdcBalance} USDC`,
            );

            await db
              .updateTable("wallets")
              .set({ funding_status: "pending" })
              .where("id", "=", wallet.id)
              .execute();

            const tenants = await db
              .selectFrom("tenants")
              .select(["id"])
              .where("wallet_id", "=", wallet.id)
              .execute();

            for (const tenant of tenants) {
              await checkAndUpdateTenantStatus(tenant.id);
            }

            if (boss) {
              await boss.send(
                BALANCE_CHECK_QUEUE,
                { walletId: wallet.id, solanaAddress: addresses.solana },
                { retryLimit: 0, startAfter: 30 },
              );
            }

            unfundedCount++;
          }
        } catch (error) {
          logger.error(
            `Balance audit failed for wallet ${wallet.id}: ${error}`,
          );
        }
      }

      logger.info(
        `Balance audit complete: checked ${checkedCount} wallets, ${unfundedCount} marked unfunded`,
      );
    } catch (error) {
      logger.error(`Balance audit failed: ${error}`);
      throw error;
    }
  });

  logger.info("Balance audit worker started");

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
          client_ip,
          request_method,
          metadata,
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
              client_ip,
              request_method,
              metadata: metadata ? JSON.stringify(metadata) : null,
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

  await boss.work<EmailJob>(EMAIL_QUEUE, { batchSize: 5 }, async (jobs) => {
    for (const job of jobs) {
      const { to, type, variables } = job.data;
      logger.info(`Processing email job ${job.id}: ${type} to ${to}`);
      try {
        await sendEmail(to, type, variables as EmailTemplateVars[typeof type]);
        logger.info(`Email sent: ${type} to ${to}`);
      } catch (error) {
        logger.error(`Failed to send ${type} email to ${to}: ${error}`);
        throw error;
      }
    }
  });

  logger.info("Email worker started");
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
  orgSlug: string | null,
): Promise<void> {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  if (!boss) {
    throw new Error("Queue not initialized");
  }

  if (nodeIds.length === 0) {
    logger.warn(`enqueueCertProvisioning: No nodes provided for ${tenantName}`);
    return;
  }

  let tenant: { id: number } | undefined;

  if (orgSlug) {
    tenant = await db
      .selectFrom("tenants")
      .select(["id"])
      .where("name", "=", tenantName)
      .where("org_slug", "=", orgSlug)
      .executeTakeFirst();
  } else {
    tenant = await db
      .selectFrom("tenants")
      .select(["id"])
      .where("name", "=", tenantName)
      .where("org_slug", "is", null)
      .executeTakeFirst();
  }

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
    { nodeIds, tenantName, orgSlug },
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
  orgSlug: string | null,
): Promise<void> {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  if (!boss) {
    throw new Error("Queue not initialized");
  }

  const jobId = await boss.send(
    TENANT_DELETION_QUEUE,
    { tenantId, tenantName, orgSlug },
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
  oldOrgSlug: string | null,
  newOrgSlug: string | null,
): Promise<void> {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  if (!boss) {
    throw new Error("Queue not initialized");
  }

  const jobId = await boss.send(
    TENANT_RENAME_QUEUE,
    { tenantId, oldName, newName, oldOrgSlug, newOrgSlug },
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

  const oldDomain = oldOrgSlug
    ? `${oldName}.${oldOrgSlug}.api.corbits.dev`
    : `${oldName}.api.corbits.dev`;
  const newDomain = newOrgSlug
    ? `${newName}.${newOrgSlug}.api.corbits.dev`
    : `${newName}.api.corbits.dev`;
  logger.info(
    `Enqueued tenant rename job ${jobId}: ${oldDomain} -> ${newDomain}`,
  );
}

export async function enqueueBalanceCheck(
  walletId: number,
  solanaAddress: string | null,
): Promise<void> {
  // Handle EVM-only wallets first (before test env check so it can be tested)
  if (!solanaAddress) {
    await db
      .updateTable("wallets")
      .set({ funding_status: "funded" })
      .where("id", "=", walletId)
      .execute();

    const tenants = await db
      .selectFrom("tenants")
      .select(["id"])
      .where("wallet_id", "=", walletId)
      .execute();

    for (const tenant of tenants) {
      await checkAndUpdateTenantStatus(tenant.id);
    }

    logger.info(`Wallet ${walletId} marked as funded (EVM-only)`);
    return;
  }

  // Skip actual queue operations in test environment
  if (process.env.NODE_ENV === "test") {
    return;
  }

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
  if (process.env.NODE_ENV === "test") {
    return;
  }

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

export async function enqueueEmail<T extends EmailType>(
  to: string,
  type: T,
  variables: EmailTemplateVars[T],
): Promise<void> {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  if (!boss) {
    throw new Error("Queue not initialized");
  }

  const jobId = await boss.send(
    EMAIL_QUEUE,
    { to, type, variables },
    {
      retryLimit: 3,
      retryDelay: 60,
      retryBackoff: true,
      expireInSeconds: 300,
    },
  );

  if (!jobId) {
    throw new Error(`Failed to enqueue ${type} email to ${to}`);
  }

  logger.info(`Enqueued email job ${jobId}: ${type} to ${to}`);
}
