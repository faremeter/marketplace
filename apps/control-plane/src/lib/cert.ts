import { exec } from "child_process";
import { promisify } from "util";
import { db } from "../db/instance.js";
import { logger } from "../logger.js";
import { checkAndUpdateTenantStatus } from "./queue.js";
import { type TenantDomainInfo, buildTenantDomain } from "./domain.js";

const execAsync = promisify(exec);

async function setCertStatus(
  domainInfo: TenantDomainInfo,
  nodeId: number,
  status: "provisioned" | "failed",
) {
  let tenant: { id: number } | undefined;

  if (domainInfo.orgSlug) {
    tenant = await db
      .selectFrom("tenants")
      .select(["id"])
      .where("name", "=", domainInfo.proxyName)
      .where("org_slug", "=", domainInfo.orgSlug)
      .executeTakeFirst();
  } else {
    tenant = await db
      .selectFrom("tenants")
      .select(["id"])
      .where("name", "=", domainInfo.proxyName)
      .where("org_slug", "is", null)
      .executeTakeFirst();
  }

  if (tenant) {
    await db
      .updateTable("tenant_nodes")
      .set({ cert_status: status })
      .where("tenant_id", "=", tenant.id)
      .where("node_id", "=", nodeId)
      .execute();

    await checkAndUpdateTenantStatus(tenant.id);
  }
}

async function pushCertToNode(
  nodeId: number,
  domainInfo: TenantDomainInfo,
  domain: string,
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
    await setCertStatus(domainInfo, nodeId, "failed");
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
          domain,
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
      await setCertStatus(domainInfo, nodeId, "failed");
      return false;
    }

    const result = (await response.json()) as {
      success?: boolean;
      error?: string;
    };

    if (result.success) {
      logger.info(
        `Successfully provisioned cert for ${domain} on node ${nodeId}`,
      );
      await setCertStatus(domainInfo, nodeId, "provisioned");
      return true;
    } else {
      logger.error(
        `Cert install failed for ${domain} on node ${nodeId}: ${result.error}`,
      );
      await setCertStatus(domainInfo, nodeId, "failed");
      return false;
    }
  } catch (err) {
    logger.error(`Error pushing cert to node ${nodeId} for ${domain}: ${err}`);
    await setCertStatus(domainInfo, nodeId, "failed");
    return false;
  }
}

export async function triggerCertProvisioning(
  nodeIds: number[],
  domainInfo: TenantDomainInfo,
): Promise<boolean> {
  const domain = buildTenantDomain(domainInfo);

  if (nodeIds.length === 0) {
    logger.warn(`triggerCertProvisioning: No nodes provided for ${domain}`);
    return true;
  }

  if (
    process.env.NODE_ENV === "development" ||
    process.env.NODE_ENV === "test"
  ) {
    logger.info(`[DEV] skipped cert provisioning for ${domain}`);
    for (const nodeId of nodeIds) {
      await setCertStatus(domainInfo, nodeId, "provisioned");
    }
    return true;
  }

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
        await setCertStatus(domainInfo, nodeId, "failed");
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
      await setCertStatus(domainInfo, nodeId, "failed");
    }
    return false;
  }

  let allSucceeded = true;
  for (const nodeId of nodeIds) {
    const success = await pushCertToNode(
      nodeId,
      domainInfo,
      domain,
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
  domainInfo: TenantDomainInfo,
): Promise<boolean> {
  const domain = buildTenantDomain(domainInfo);

  if (
    process.env.NODE_ENV === "development" ||
    process.env.NODE_ENV === "test"
  ) {
    logger.info(`[DEV] skipped cert deletion for ${domain} on node ${nodeId}`);
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
        body: JSON.stringify({ domain }),
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

    logger.info(`Deleted cert for ${domain} on node ${nodeId}`);
    return true;
  } catch (err) {
    logger.error(`Error deleting cert on node ${nodeId} for ${domain}: ${err}`);
    return false;
  }
}

export async function deleteLocalCert(
  domainInfo: TenantDomainInfo,
): Promise<void> {
  const domain = buildTenantDomain(domainInfo);

  if (
    process.env.NODE_ENV === "development" ||
    process.env.NODE_ENV === "test"
  ) {
    logger.info(`[DEV] skipped local cert deletion for ${domain}`);
    return;
  }

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
