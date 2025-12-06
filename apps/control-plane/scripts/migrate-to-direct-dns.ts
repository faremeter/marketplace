/* eslint-disable no-console, @typescript-eslint/no-non-null-assertion */
import "dotenv/config";
import { readFileSync } from "fs";
import { createDatabase } from "../src/db/client.js";
import { upsertNodeDnsRecord, createHealthCheck } from "../src/lib/dns.js";

async function triggerCertProvisioningHttp(
  internalIp: string,
  tenantName: string,
): Promise<boolean> {
  try {
    const response = await fetch(
      `http://${internalIp}:80/internal/provision-cert`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_name: tenantName }),
      },
    );

    if (!response.ok) {
      console.warn(`  Cert provisioning HTTP failed: ${response.status}`);
      return false;
    }

    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch (err) {
    console.warn(`  Cert provisioning error: ${err}`);
    return false;
  }
}

const db = createDatabase({
  host: process.env.DATABASE_HOST || "localhost",
  port: parseInt(process.env.DATABASE_PORT || "5432"),
  database: process.env.DATABASE_NAME || "control_plane",
  user: process.env.DATABASE_USER || "control_plane",
  password: process.env.DATABASE_PASSWORD!,
});

async function main() {
  const configFile = process.argv[2];

  if (!configFile) {
    console.error("Usage: tsx scripts/migrate-to-direct-dns.ts <nodes.json>");
    console.error("");
    console.error("nodes.json format:");
    console.error('  { "node-name": "public-ip", ... }');
    console.error("");
    console.error(
      "Or use --from-db to skip public IP updates and just provision DNS/certs",
    );
    process.exit(1);
  }

  const skipNodeUpdate = configFile === "--from-db";

  if (!skipNodeUpdate) {
    const nodeMapping: Record<string, string> = JSON.parse(
      readFileSync(configFile, "utf-8"),
    );

    console.log("Updating node public IPs...");
    for (const [nodeName, publicIp] of Object.entries(nodeMapping)) {
      const result = await db
        .updateTable("nodes")
        .set({ public_ip: publicIp })
        .where("name", "=", nodeName)
        .returningAll()
        .executeTakeFirst();

      if (result) {
        console.log(`  Updated ${nodeName} -> ${publicIp}`);
      } else {
        console.warn(`  Node not found: ${nodeName}`);
      }
    }
  }

  console.log("\nProcessing tenants with assigned nodes...");

  const tenantsWithNodes = await db
    .selectFrom("tenants")
    .innerJoin("tenant_nodes", "tenant_nodes.tenant_id", "tenants.id")
    .innerJoin("nodes", "nodes.id", "tenant_nodes.node_id")
    .select([
      "tenants.id as tenantId",
      "tenants.name as tenantName",
      "tenant_nodes.id as tenantNodeId",
      "nodes.id as nodeId",
      "nodes.name as nodeName",
      "nodes.internal_ip as internalIp",
      "nodes.public_ip as publicIp",
      "nodes.status as nodeStatus",
    ])
    .where("tenants.is_active", "=", true)
    .execute();

  const tenantMap = new Map<
    number,
    {
      name: string;
      nodes: {
        tenantNodeId: number;
        id: number;
        name: string;
        internalIp: string;
        publicIp: string | null;
        status: string;
      }[];
    }
  >();

  for (const row of tenantsWithNodes) {
    if (!tenantMap.has(row.tenantId)) {
      tenantMap.set(row.tenantId, { name: row.tenantName, nodes: [] });
    }
    tenantMap.get(row.tenantId)!.nodes.push({
      tenantNodeId: row.tenantNodeId,
      id: row.nodeId,
      name: row.nodeName,
      internalIp: row.internalIp,
      publicIp: row.publicIp,
      status: row.nodeStatus,
    });
  }

  for (const [tenantId, tenant] of tenantMap) {
    console.log(`\nTenant: ${tenant.name} (id=${tenantId})`);

    for (const node of tenant.nodes) {
      if (!node.publicIp) {
        console.log(`  Skipping node ${node.name}: no public IP`);
        continue;
      }

      console.log(`  Processing node ${node.name} (${node.publicIp})...`);

      // Step 1: Create health check
      console.log(`    Creating health check...`);
      const healthCheckId = await createHealthCheck(tenant.name, node.publicIp);
      if (healthCheckId) {
        await db
          .updateTable("tenant_nodes")
          .set({ health_check_id: healthCheckId })
          .where("id", "=", node.tenantNodeId)
          .execute();
        console.log(`    Health check created: ${healthCheckId}`);
      } else {
        console.warn(`    Failed to create health check`);
      }

      // Step 2: Create weighted DNS record with health check
      console.log(`    Creating DNS record...`);
      const dnsSuccess = await upsertNodeDnsRecord(
        tenant.name,
        node.id,
        node.publicIp,
        healthCheckId,
      );
      if (dnsSuccess) {
        console.log(`    DNS record created`);
      } else {
        console.warn(`    Failed to create DNS record`);
      }

      // Step 3: Provision cert (only if node is active)
      if (node.status !== "active") {
        console.log(`    Skipping cert: node status=${node.status}`);
        continue;
      }

      console.log(`    Provisioning cert...`);
      const certSuccess = await triggerCertProvisioningHttp(
        node.internalIp,
        tenant.name,
      );
      if (certSuccess) {
        await db
          .updateTable("tenant_nodes")
          .set({ cert_status: "provisioned" })
          .where("id", "=", node.tenantNodeId)
          .execute();
        console.log(`    Cert provisioned`);
      } else {
        await db
          .updateTable("tenant_nodes")
          .set({ cert_status: "failed" })
          .where("id", "=", node.tenantNodeId)
          .execute();
        console.warn(`    Failed to provision cert`);
      }
    }
  }

  console.log("\nMigration complete.");
  await db.destroy();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
