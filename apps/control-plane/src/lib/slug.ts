const MAX_SLUG_LENGTH = 63;

/**
 * Converts a string to a DNS-compatible slug.
 * - Trims whitespace
 * - Converts to lowercase
 * - Replaces non-alphanumeric characters with hyphens
 * - Removes leading/trailing hyphens
 * - Limits to 63 characters (DNS subdomain requirement)
 */
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH);
}

/**
 * Validates that a slug is DNS-compatible.
 * Must be 1-63 chars, lowercase alphanumeric + hyphens,
 * cannot start or end with hyphen.
 */
export function validateSlug(slug: string): boolean {
  if (!slug || slug.length > MAX_SLUG_LENGTH) return false;
  if (slug.length === 1) return /^[a-z0-9]$/.test(slug);
  return /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug);
}
