import "dotenv/config";
import { db } from "../db/instance.js";
import { endpointPathToOpenApiPath } from "../lib/openapi-sync.js";

type UnconvertibleEntry = {
  endpointId: number;
  pathPattern: string;
};

type TenantReport = {
  tenantId: number;
  tenantName: string;
  tenantSlug: string | null;
  total: number;
  convertible: number;
  unconvertible: UnconvertibleEntry[];
};

const endpoints = await db
  .selectFrom("endpoints")
  .innerJoin("tenants", "tenants.id", "endpoints.tenant_id")
  .select([
    "endpoints.id as endpoint_id",
    "endpoints.tenant_id",
    "endpoints.path",
    "endpoints.path_pattern",
    "tenants.name as tenant_name",
    "tenants.org_slug as tenant_slug",
  ])
  .where("endpoints.is_active", "=", true)
  .where("tenants.is_active", "=", true)
  .orderBy("tenants.id", "asc")
  .orderBy("endpoints.priority", "asc")
  .execute();

const reportsByTenant = new Map<number, TenantReport>();

for (const endpoint of endpoints) {
  let report = reportsByTenant.get(endpoint.tenant_id);
  if (!report) {
    report = {
      tenantId: endpoint.tenant_id,
      tenantName: endpoint.tenant_name,
      tenantSlug: endpoint.tenant_slug,
      total: 0,
      convertible: 0,
      unconvertible: [],
    };
    reportsByTenant.set(endpoint.tenant_id, report);
  }

  report.total += 1;

  const openApiPath = endpointPathToOpenApiPath(
    endpoint.path,
    endpoint.path_pattern,
  );

  if (openApiPath !== null) {
    report.convertible += 1;
  } else {
    report.unconvertible.push({
      endpointId: endpoint.endpoint_id,
      pathPattern: endpoint.path_pattern,
    });
  }
}

const lines: string[] = [];

lines.push("=== Regex Endpoint Audit ===");
lines.push("");

const reports = [...reportsByTenant.values()];

for (const report of reports) {
  const slugPart = report.tenantSlug ? `, slug=${report.tenantSlug}` : "";
  lines.push(`Tenant: ${report.tenantName} (id=${report.tenantId}${slugPart})`);
  lines.push(`  Total endpoints: ${report.total}`);
  lines.push(`  Convertible: ${report.convertible}`);
  lines.push(`  Unconvertible: ${report.unconvertible.length}`);
  for (const entry of report.unconvertible) {
    lines.push(`    - ${entry.pathPattern} (endpoint_id=${entry.endpointId})`);
  }
  const ready = report.unconvertible.length === 0;
  lines.push(`  Status: ${ready ? "READY" : "NOT READY"} for gateway mode`);
  lines.push("");
}

const readyTenants = reports.filter((r) => r.unconvertible.length === 0);
const notReadyTenants = reports.filter((r) => r.unconvertible.length > 0);

lines.push("=== Summary ===");
lines.push(`Total tenants: ${reports.length}`);
lines.push(
  `Ready: ${readyTenants.length}${readyTenants.length > 0 ? ` (${readyTenants.map((r) => r.tenantName).join(", ")})` : ""}`,
);
lines.push(
  `Not ready: ${notReadyTenants.length}${notReadyTenants.length > 0 ? ` (${notReadyTenants.map((r) => r.tenantName).join(", ")})` : ""}`,
);

process.stdout.write(lines.join("\n") + "\n");

await db.destroy();

process.exit(notReadyTenants.length > 0 ? 1 : 0);
