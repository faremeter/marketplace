import { exec } from "child_process";
import { promisify } from "util";
import { db } from "../db/instance.js";
import { logger } from "../logger.js";
import { checkAndUpdateTenantStatus } from "./queue.js";

const execAsync = promisify(exec);

const BASE_DOMAIN = "test.api.corbits.dev";

async function setCertStatus(
  tenantName: string,
  nodeId: number,
  status: "provisioned" | "failed",
) {
  const tenant = await db
    .selectFrom("tenants")
    .select(["id"])
    .where("name", "=", tenantName)
    .executeTakeFirst();

  if (tenant) {
    await db
      .updateTable("tenant_nodes")
      .set({ cert_status: status })
      .where("tenant_id", "=", tenant.id)
      .where("node_id", "=", nodeId)
      .execute();

    // Check if tenant can transition to active
    await checkAndUpdateTenantStatus(tenant.id);
  }
}

async function pushCertToNode(
  nodeId: number,
  tenantName: string,
  fullchain: string,
  privkey: string,
): Promise<boolean> {
  const node = await db
    .selectFrom("nodes")
    .select(["internal_ip", "status"])
    .where("id", "=", nodeId)
    .executeTakeFirst();

  if (!node) {
    logger.error(`pushCertToNode: Node ${nodeId} not found`);
    await setCertStatus(tenantName, nodeId, "failed");
    return false;
  }

  if (node.status !== "active") {
    logger.warn(`pushCertToNode: Node ${nodeId} is not active, skipping`);
    return false;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(
      `http://${node.internal_ip}:80/internal/install-cert`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_name: tenantName,
          fullchain,
          privkey,
        }),
        signal: controller.signal,
      },
    );

    clearTimeout(timeout);

    if (!response.ok) {
      const text = await response.text();
      logger.error(
        `Failed to push cert to node ${nodeId}: ${response.status} - ${text}`,
      );
      await setCertStatus(tenantName, nodeId, "failed");
      return false;
    }

    const result = (await response.json()) as {
      success?: boolean;
      error?: string;
    };

    if (result.success) {
      logger.info(
        `Successfully provisioned cert for ${tenantName} on node ${nodeId}`,
      );
      await setCertStatus(tenantName, nodeId, "provisioned");
      return true;
    } else {
      logger.error(
        `Cert install failed for ${tenantName} on node ${nodeId}: ${result.error}`,
      );
      await setCertStatus(tenantName, nodeId, "failed");
      return false;
    }
  } catch (err) {
    logger.error(
      `Error pushing cert to node ${nodeId} for ${tenantName}: ${err}`,
    );
    await setCertStatus(tenantName, nodeId, "failed");
    return false;
  }
}

export async function triggerCertProvisioning(
  nodeIds: number[],
  tenantName: string,
): Promise<boolean> {
  if (nodeIds.length === 0) {
    logger.warn(`triggerCertProvisioning: No nodes provided for ${tenantName}`);
    return true;
  }

  if (
    process.env.NODE_ENV === "development" ||
    process.env.NODE_ENV === "test"
  ) {
    logger.info(`[DEV] skipped cert provisioning for ${tenantName}`);
    for (const nodeId of nodeIds) {
      await setCertStatus(tenantName, nodeId, "provisioned");
    }
    return true;
  }

  const domain = `${tenantName}.${BASE_DOMAIN}`;
  const certDir = `/etc/letsencrypt/live/${domain}`;

  const { stdout: certCheckResult } = await execAsync(
    `sudo test -f ${certDir}/fullchain.pem && echo yes || echo no`,
  );
  const certExists = certCheckResult.trim() === "yes";

  if (!certExists) {
    try {
      logger.info(`Running certbot for ${domain}`);
      await execAsync(
        `sudo certbot certonly --dns-route53 -d ${domain} ` +
          `--agree-tos -m ${process.env.LETSENCRYPT_EMAIL} --non-interactive`,
        { timeout: 180000 },
      );
      logger.info(`Certbot completed for ${domain}`);
    } catch (err) {
      logger.error(`Certbot failed for ${domain}: ${err}`);
      for (const nodeId of nodeIds) {
        await setCertStatus(tenantName, nodeId, "failed");
      }
      return false;
    }
  } else {
    logger.info(`Cert already exists for ${domain}, pushing to nodes`);
  }

  let fullchain: string;
  let privkey: string;
  try {
    const { stdout: fullchainOut } = await execAsync(
      `sudo /usr/local/bin/read-tenant-cert ${domain} fullchain.pem`,
    );
    fullchain = fullchainOut;
    const { stdout: privkeyOut } = await execAsync(
      `sudo /usr/local/bin/read-tenant-cert ${domain} privkey.pem`,
    );
    privkey = privkeyOut;
  } catch (err) {
    logger.error(`Failed to read cert files for ${domain}: ${err}`);
    for (const nodeId of nodeIds) {
      await setCertStatus(tenantName, nodeId, "failed");
    }
    return false;
  }

  let allSucceeded = true;
  for (const nodeId of nodeIds) {
    const success = await pushCertToNode(
      nodeId,
      tenantName,
      fullchain,
      privkey,
    );
    if (!success) {
      allSucceeded = false;
    }
  }

  return allSucceeded;
}

export async function deleteCertOnNode(
  nodeId: number,
  tenantName: string,
): Promise<boolean> {
  if (
    process.env.NODE_ENV === "development" ||
    process.env.NODE_ENV === "test"
  ) {
    logger.info(
      `[DEV] skipped cert deletion for ${tenantName} on node ${nodeId}`,
    );
    return true;
  }

  const node = await db
    .selectFrom("nodes")
    .select(["internal_ip", "status"])
    .where("id", "=", nodeId)
    .executeTakeFirst();

  if (!node || node.status !== "active") {
    return false;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(
      `http://${node.internal_ip}:80/internal/delete-cert`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_name: tenantName }),
        signal: controller.signal,
      },
    );

    clearTimeout(timeout);

    if (!response.ok) {
      const text = await response.text();
      logger.error(
        `Failed to delete cert on node ${nodeId}: ${response.status} - ${text}`,
      );
      return false;
    }

    logger.info(`Deleted cert for ${tenantName} on node ${nodeId}`);
    return true;
  } catch (err) {
    logger.error(
      `Error deleting cert on node ${nodeId} for ${tenantName}: ${err}`,
    );
    return false;
  }
}

export async function deleteLocalCert(tenantName: string): Promise<void> {
  if (
    process.env.NODE_ENV === "development" ||
    process.env.NODE_ENV === "test"
  ) {
    logger.info(`[DEV] skipped local cert deletion for ${tenantName}`);
    return;
  }

  const domain = `${tenantName}.${BASE_DOMAIN}`;
  try {
    await execAsync(
      `sudo certbot delete --cert-name ${domain} --non-interactive`,
      { timeout: 30000 },
    );
    logger.info(`Deleted local cert for ${domain}`);
  } catch (err) {
    logger.warn(`Failed to delete local cert for ${domain}: ${err}`);
  }
}
