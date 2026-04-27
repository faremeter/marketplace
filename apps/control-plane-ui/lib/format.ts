export function titleCase(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

const PROXY_BASE_DOMAIN = process.env.NEXT_PUBLIC_PROXY_BASE_DOMAIN;
const PROXY_BASE_PROTOCOL =
  process.env.NEXT_PUBLIC_PROXY_BASE_PROTOCOL ?? "https";
const PROXY_BASE_PORT = process.env.NEXT_PUBLIC_PROXY_BASE_PORT;

if (!PROXY_BASE_DOMAIN) {
  throw new Error("NEXT_PUBLIC_PROXY_BASE_DOMAIN must be set");
}

export interface ProxyUrlOptions {
  proxyName: string;
  orgSlug?: string | null;
}

function withProxyBase(hostname: string): string {
  const port = PROXY_BASE_PORT ? `:${PROXY_BASE_PORT}` : "";
  return `${PROXY_BASE_PROTOCOL}://${hostname}${port}`;
}

export function getProxyUrl(options: ProxyUrlOptions): string {
  const { proxyName, orgSlug } = options;

  if (!orgSlug) {
    return withProxyBase(`${proxyName}.${PROXY_BASE_DOMAIN}`);
  }

  return withProxyBase(`${proxyName}.${orgSlug}.${PROXY_BASE_DOMAIN}`);
}

export function getProxyUrlPattern(options: ProxyUrlOptions): string {
  const { proxyName, orgSlug } = options;

  if (!orgSlug) {
    return `${proxyName}.${PROXY_BASE_DOMAIN}`;
  }

  return `${proxyName}.${orgSlug}.${PROXY_BASE_DOMAIN}`;
}

export function getOrgProxyPattern(orgSlug: string): string {
  return `*.${orgSlug}.${PROXY_BASE_DOMAIN}`;
}
