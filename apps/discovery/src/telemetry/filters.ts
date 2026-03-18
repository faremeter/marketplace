const BOT_PATTERNS = [
  /googlebot/i,
  /bingbot/i,
  /slurp/i,
  /duckduckbot/i,
  /baiduspider/i,
  /yandexbot/i,
  /facebookexternalhit/i,
  /twitterbot/i,
  /linkedinbot/i,
  /applebot/i,
  /semrushbot/i,
  /ahrefsbot/i,
  /mj12bot/i,
  /dotbot/i,
  /petalbot/i,
  /bytespider/i,
  /gptbot/i,
];

export function isBot(userAgent: string | undefined): boolean {
  if (!userAgent) return false;
  return BOT_PATTERNS.some((p) => p.test(userAgent));
}

export function isValidSearch(query: string): boolean {
  const stripped = query.replace(/[^\p{L}\p{N}_]/gu, "");
  return stripped.length >= 3;
}

export function hasResults(proxyCount: number, endpointCount: number): boolean {
  return proxyCount > 0 || endpointCount > 0;
}
