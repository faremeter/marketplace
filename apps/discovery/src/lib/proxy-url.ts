const BASE_DOMAIN = "api.corbits.dev";

export function buildProxyUrl(name: string, orgSlug: string | null): string {
  if (orgSlug) {
    return `https://${name}.${orgSlug}.${BASE_DOMAIN}`;
  }
  return `https://${name}.${BASE_DOMAIN}`;
}
