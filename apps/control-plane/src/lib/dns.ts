import {
  Route53Client,
  ChangeResourceRecordSetsCommand,
  ListResourceRecordSetsCommand,
  CreateHealthCheckCommand,
  DeleteHealthCheckCommand,
  ChangeAction,
} from "@aws-sdk/client-route-53";
import { logger } from "../logger.js";

const route53 = new Route53Client({});

const ZONE_ID = process.env.ROUTE53_ZONE_ID;
const DNS_TTL = 60;
const BASE_DOMAIN = "test.api.corbits.dev";
const isDev = process.env.NODE_ENV === "development";

export async function upsertNodeDnsRecord(
  tenantName: string,
  nodeId: number,
  publicIp: string,
  healthCheckId: string | null,
): Promise<boolean> {
  if (isDev) {
    logger.info(`[DEV] skipped DNS upsert for ${tenantName}`);
    return true;
  }

  if (!ZONE_ID) {
    logger.error("ROUTE53_ZONE_ID not configured");
    return false;
  }

  const recordName = `${tenantName}.${BASE_DOMAIN}`;
  const setIdentifier = `${tenantName}-node-${nodeId}`;

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
      `Failed to upsert DNS record for ${tenantName} node ${nodeId}: ${err}`,
    );
    return false;
  }
}

export async function deleteNodeDnsRecord(
  tenantName: string,
  nodeId: number,
): Promise<boolean> {
  if (isDev) {
    logger.info(`[DEV] skipped DNS delete for ${tenantName}`);
    return true;
  }

  if (!ZONE_ID) {
    logger.error("ROUTE53_ZONE_ID not configured");
    return false;
  }

  const recordName = `${tenantName}.${BASE_DOMAIN}.`;
  const setIdentifier = `${tenantName}-node-${nodeId}`;

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
      `Failed to delete DNS record for ${tenantName} node ${nodeId}: ${err}`,
    );
    return false;
  }
}

export async function deleteAllTenantDnsRecords(
  tenantName: string,
): Promise<boolean> {
  if (isDev) {
    logger.info(`[DEV] skipped delete all DNS for ${tenantName}`);
    return true;
  }

  if (!ZONE_ID) {
    logger.error("ROUTE53_ZONE_ID not configured");
    return false;
  }

  const recordName = `${tenantName}.${BASE_DOMAIN}.`;

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
      logger.info(`No DNS records found for ${tenantName}`);
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
    logger.info(`Deleted ${records.length} DNS record(s) for ${tenantName}`);
    return true;
  } catch (err) {
    logger.error(`Failed to delete DNS records for ${tenantName}: ${err}`);
    return false;
  }
}

export async function createHealthCheck(
  tenantName: string,
  nodePublicIp: string,
): Promise<string | null> {
  if (isDev) {
    const mockId = `dev-hc-${Date.now()}`;
    logger.info(`[DEV] skipped health check creation, mock id: ${mockId}`);
    return mockId;
  }

  try {
    const command = new CreateHealthCheckCommand({
      CallerReference: `${tenantName}-${nodePublicIp}-${Date.now()}`,
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
        `Created health check ${healthCheckId} for ${tenantName} @ ${nodePublicIp}`,
      );
    }

    return healthCheckId ?? null;
  } catch (err) {
    logger.error(
      `Failed to create health check for ${tenantName} @ ${nodePublicIp}: ${err}`,
    );
    return null;
  }
}

export async function deleteHealthCheck(
  healthCheckId: string,
): Promise<boolean> {
  if (isDev) {
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
