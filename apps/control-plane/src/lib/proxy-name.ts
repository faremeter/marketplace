const MAX_SUBDOMAIN_LENGTH = 63;

export interface ProxyNameValidation {
  valid: boolean;
  sanitized: string;
  error?: string;
}

/**
 * Sanitizes a proxy name to be a valid DNS subdomain label.
 * - Converts to lowercase
 * - Replaces consecutive non-alphanumeric characters with a single dash
 * - Trims leading/trailing dashes
 * - Enforces max 63 character limit (DNS subdomain requirement)
 */
export function sanitizeProxyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SUBDOMAIN_LENGTH);
}

/**
 * Validates a proxy name and returns validation result with sanitized name.
 */
export function validateProxyName(name: string): ProxyNameValidation {
  const trimmed = name.trim();

  if (!trimmed) {
    return { valid: false, sanitized: "", error: "Proxy name is required" };
  }

  const sanitized = sanitizeProxyName(trimmed);

  if (!sanitized) {
    return {
      valid: false,
      sanitized: "",
      error: "Proxy name must contain at least one letter or number",
    };
  }

  // Check for valid DNS subdomain pattern
  if (
    !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(sanitized) &&
    sanitized.length > 1
  ) {
    return {
      valid: false,
      sanitized,
      error: "Proxy name must start and end with a letter or number",
    };
  }

  return { valid: true, sanitized };
}
