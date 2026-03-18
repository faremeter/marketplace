export function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .sort()
    .join(" ");
}
