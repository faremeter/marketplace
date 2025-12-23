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
 * Validates and sanitizes a proxy name.
 * Returns validation result with sanitized name and any errors.
 */
export function validateProxyName(name: string): ProxyNameValidation {
  const trimmed = name.trim();

  if (!trimmed) {
    return { valid: false, sanitized: "", error: "Name is required" };
  }

  const sanitized = sanitizeProxyName(trimmed);

  if (!sanitized) {
    return {
      valid: false,
      sanitized: "",
      error: "Name must contain at least one letter or number",
    };
  }

  if (trimmed.length > MAX_SUBDOMAIN_LENGTH) {
    return {
      valid: true,
      sanitized,
      error: `Name will be truncated to ${MAX_SUBDOMAIN_LENGTH} characters`,
    };
  }

  return { valid: true, sanitized };
}
