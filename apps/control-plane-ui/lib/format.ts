import { type } from "arktype";

export function titleCase(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

const envType = type({ NEXT_PUBLIC_PROXY_BASE_DOMAIN: "string > 0" });
const env = envType.assert(process.env);
const PROXY_BASE_DOMAIN = env.NEXT_PUBLIC_PROXY_BASE_DOMAIN;

export interface ProxyUrlOptions {
  proxyName: string;
  orgSlug?: string | null;
}

export function getProxyUrl(options: ProxyUrlOptions): string {
  const { proxyName, orgSlug } = options;

  if (!orgSlug) {
    return `https://${proxyName}.${PROXY_BASE_DOMAIN}`;
  }

  return `https://${proxyName}.${orgSlug}.${PROXY_BASE_DOMAIN}`;
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
