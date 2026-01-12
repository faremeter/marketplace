import {
  Route53Client,
  ChangeResourceRecordSetsCommand,
  ListResourceRecordSetsCommand,
  CreateHealthCheckCommand,
  DeleteHealthCheckCommand,
  ChangeAction,
} from "@aws-sdk/client-route-53";
import { logger } from "../logger.js";
import {
  type TenantDomainInfo,
  buildTenantDomain,
  buildSetIdentifier,
} from "./domain.js";

const route53 = new Route53Client({});

const ZONE_ID = process.env.ROUTE53_ZONE_ID;
const DNS_TTL = 60;
const skipExternal =
  process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";

export async function upsertNodeDnsRecord(
  domainInfo: TenantDomainInfo,
  nodeId: number,
  publicIp: string,
  healthCheckId: string | null,
): Promise<boolean> {
  const domain = buildTenantDomain(domainInfo);

  if (skipExternal) {
    logger.info(`[DEV] skipped DNS upsert for ${domain}`);
    return true;
  }

  if (!ZONE_ID) {
    logger.error("ROUTE53_ZONE_ID not configured");
    return false;
  }

  const recordName = domain;
  const setIdentifier = buildSetIdentifier(domainInfo, nodeId);

  try {
    const resourceRecordSet: Record<string, unknown> = {
      Name: recordName,
      Type: "A",
      SetIdentifier: setIdentifier,
      Weight: 100,
      TTL: DNS_TTL,
      ResourceRecords: [{ Value: publicIp }],
    };

    if (healthCheckId) {
      resourceRecordSet.HealthCheckId = healthCheckId;
    }

    const command = new ChangeResourceRecordSetsCommand({
      HostedZoneId: ZONE_ID,
      ChangeBatch: {
        Changes: [
          {
            Action: ChangeAction.UPSERT,
            ResourceRecordSet: resourceRecordSet as never,
          },
        ],
      },
    });

    await route53.send(command);
    logger.info(
      `Upserted weighted DNS record ${setIdentifier} -> ${publicIp}${healthCheckId ? ` (health check: ${healthCheckId})` : ""}`,
    );
    return true;
  } catch (err) {
    logger.error(
      `Failed to upsert DNS record for ${domain} node ${nodeId}: ${err}`,
    );
    return false;
  }
}

export async function deleteNodeDnsRecord(
  domainInfo: TenantDomainInfo,
  nodeId: number,
): Promise<boolean> {
  const domain = buildTenantDomain(domainInfo);

  if (skipExternal) {
    logger.info(`[DEV] skipped DNS delete for ${domain}`);
    return true;
  }

  if (!ZONE_ID) {
    logger.error("ROUTE53_ZONE_ID not configured");
    return false;
  }

  const recordName = `${domain}.`;
  const setIdentifier = buildSetIdentifier(domainInfo, nodeId);

  try {
    const listCommand = new ListResourceRecordSetsCommand({
      HostedZoneId: ZONE_ID,
      StartRecordName: recordName,
      StartRecordType: "A",
      StartRecordIdentifier: setIdentifier,
      MaxItems: 1,
    });

    const listResult = await route53.send(listCommand);
    const record = listResult.ResourceRecordSets?.find(
      (r) =>
        r.Name === recordName &&
        r.Type === "A" &&
        r.SetIdentifier === setIdentifier,
    );

    if (!record) {
      logger.info(`No DNS record found for ${setIdentifier}`);
      return true;
    }

    const deleteCommand = new ChangeResourceRecordSetsCommand({
      HostedZoneId: ZONE_ID,
      ChangeBatch: {
        Changes: [
          {
            Action: ChangeAction.DELETE,
            ResourceRecordSet: record,
          },
        ],
      },
    });

    await route53.send(deleteCommand);
    logger.info(`Deleted weighted DNS record ${setIdentifier}`);
    return true;
  } catch (err) {
    logger.error(
      `Failed to delete DNS record for ${domain} node ${nodeId}: ${err}`,
    );
    return false;
  }
}

export async function deleteAllTenantDnsRecords(
  domainInfo: TenantDomainInfo,
): Promise<boolean> {
  const domain = buildTenantDomain(domainInfo);

  if (skipExternal) {
    logger.info(`[DEV] skipped delete all DNS for ${domain}`);
    return true;
  }

  if (!ZONE_ID) {
    logger.error("ROUTE53_ZONE_ID not configured");
    return false;
  }

  const recordName = `${domain}.`;

  try {
    const listCommand = new ListResourceRecordSetsCommand({
      HostedZoneId: ZONE_ID,
      StartRecordName: recordName,
      StartRecordType: "A",
      MaxItems: 100,
    });

    const listResult = await route53.send(listCommand);
    const records =
      listResult.ResourceRecordSets?.filter(
        (r) => r.Name === recordName && r.Type === "A",
      ) ?? [];

    if (records.length === 0) {
      logger.info(`No DNS records found for ${domain}`);
      return true;
    }

    const deleteCommand = new ChangeResourceRecordSetsCommand({
      HostedZoneId: ZONE_ID,
      ChangeBatch: {
        Changes: records.map((record) => ({
          Action: ChangeAction.DELETE,
          ResourceRecordSet: record,
        })),
      },
    });

    await route53.send(deleteCommand);
    logger.info(`Deleted ${records.length} DNS record(s) for ${domain}`);
    return true;
  } catch (err) {
    logger.error(`Failed to delete DNS records for ${domain}: ${err}`);
    return false;
  }
}

export async function createHealthCheck(
  domainInfo: TenantDomainInfo,
  nodePublicIp: string,
): Promise<string | null> {
  const domain = buildTenantDomain(domainInfo);

  if (skipExternal) {
    const mockId = `dev-hc-${Date.now()}`;
    logger.info(`[DEV] skipped health check creation, mock id: ${mockId}`);
    return mockId;
  }

  try {
    const command = new CreateHealthCheckCommand({
      CallerReference: `${domain}-${nodePublicIp}-${Date.now()}`,
      HealthCheckConfig: {
        IPAddress: nodePublicIp,
        Port: 80,
        Type: "HTTP",
        RequestInterval: 30,
        FailureThreshold: 3,
        ResourcePath: "/health",
      },
    });

    const result = await route53.send(command);
    const healthCheckId = result.HealthCheck?.Id;

    if (healthCheckId) {
      logger.info(
        `Created health check ${healthCheckId} for ${domain} @ ${nodePublicIp}`,
      );
    }

    return healthCheckId ?? null;
  } catch (err) {
    logger.error(
      `Failed to create health check for ${domain} @ ${nodePublicIp}: ${err}`,
    );
    return null;
  }
}

export async function deleteHealthCheck(
  healthCheckId: string,
): Promise<boolean> {
  if (skipExternal) {
    logger.info(`[DEV] skipped health check deletion: ${healthCheckId}`);
    return true;
  }

  try {
    const command = new DeleteHealthCheckCommand({
      HealthCheckId: healthCheckId,
    });

    await route53.send(command);
    logger.info(`Deleted health check ${healthCheckId}`);
    return true;
  } catch (err) {
    logger.error(`Failed to delete health check ${healthCheckId}: ${err}`);
    return false;
  }
}
