const BASE_DOMAIN = "api.corbits.dev";

export interface TenantDomainInfo {
  proxyName: string;
  orgSlug: string | null;
}

export function buildTenantDomain(info: TenantDomainInfo): string {
  if (!info.orgSlug) {
    return `${info.proxyName}.${BASE_DOMAIN}`;
  }
  return `${info.proxyName}.${info.orgSlug}.${BASE_DOMAIN}`;
}

export function buildSetIdentifier(
  info: TenantDomainInfo,
  nodeId: number,
): string {
  if (!info.orgSlug) {
    return `${info.proxyName}-node-${nodeId}`;
  }
  return `${info.proxyName}-${info.orgSlug}-node-${nodeId}`;
}

export function getBaseDomain(): string {
  return BASE_DOMAIN;
}

export function toDomainInfo(tenant: {
  name: string;
  org_slug?: string | null;
}): TenantDomainInfo {
  return {
    proxyName: tenant.name,
    orgSlug: tenant.org_slug ?? null,
  };
}
