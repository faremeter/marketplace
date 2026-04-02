if (!process.env.PROXY_BASE_DOMAIN) {
  throw new Error("PROXY_BASE_DOMAIN environment variable is required");
}
const BASE_DOMAIN: string = process.env.PROXY_BASE_DOMAIN;

export function buildProxyUrl(name: string, orgSlug: string | null): string {
  if (orgSlug) {
    return `https://${name}.${orgSlug}.${BASE_DOMAIN}`;
  }
  return `https://${name}.${BASE_DOMAIN}`;
}
