import PgBoss from "pg-boss";
import { triggerCertProvisioning } from "./cert.js";
import { logger } from "../logger.js";
import { db } from "../server.js";

let boss: PgBoss | null = null;

const CERT_PROVISIONING_QUEUE = "cert-provisioning";

interface CertProvisioningJob {
  nodeId: number;
  tenantName: string;
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
