export type HeaderType =
  | "Authorization"
  | "X-API-Key"
  | "X-Auth-Token"
  | "Api-Key"
  | "custom";
export type ValueFormat = "bearer" | "basic" | "none" | "custom";

export const KNOWN_HEADERS: HeaderType[] = [
  "Authorization",
  "X-API-Key",
  "X-Auth-Token",
  "Api-Key",
];

export const BLOCKED_HEADERS = [
  "host",
  "content-length",
  "transfer-encoding",
  "connection",
  "keep-alive",
  "upgrade",
  "te",
  "trailer",
];

export function isBlockedHeader(header: string): boolean {
  return BLOCKED_HEADERS.includes(header.toLowerCase());
}

export function parseExistingAuth(
  header: string | null,
  value: string | null,
): {
  headerType: HeaderType;
  customHeader: string;
  valueFormat: ValueFormat;
  customPrefix: string;
  token: string;
} {
  let headerType: HeaderType = "Authorization";
  let customHeader = "";

  if (header) {
    if (KNOWN_HEADERS.includes(header as HeaderType)) {
      headerType = header as HeaderType;
    } else {
      headerType = "custom";
      customHeader = header;
    }
  }

  let valueFormat: ValueFormat = "none";
  let customPrefix = "";
  let token = value ?? "";

  if (value) {
    if (value.startsWith("Bearer ")) {
      valueFormat = "bearer";
      token = value.slice(7);
    } else if (value.startsWith("Basic ")) {
      valueFormat = "basic";
      token = value.slice(6);
    } else {
      const spaceIndex = value.indexOf(" ");
      if (spaceIndex > 0 && spaceIndex < 20) {
        valueFormat = "custom";
        customPrefix = value.slice(0, spaceIndex);
        token = value.slice(spaceIndex + 1);
      } else {
        valueFormat = "none";
        token = value;
      }
    }
  }

  return { headerType, customHeader, valueFormat, customPrefix, token };
}

export function composeFinalHeader(
  headerType: HeaderType,
  customHeader: string,
): string | null {
  if (headerType === "custom") {
    return customHeader.trim() || null;
  }
  return headerType;
}

export function composeFinalValue(
  valueFormat: ValueFormat,
  customPrefix: string,
  token: string,
): string | null {
  const trimmedToken = token.trim();
  if (!trimmedToken) return null;

  switch (valueFormat) {
    case "bearer":
      return `Bearer ${trimmedToken}`;
    case "basic":
      return `Basic ${trimmedToken}`;
    case "custom":
      return customPrefix.trim()
        ? `${customPrefix.trim()} ${trimmedToken}`
        : trimmedToken;
    case "none":
      return trimmedToken;
  }
}

export function maskToken(token: string): string {
  const trimmed = token.trim();
  if (trimmed.length <= 6) return trimmed;
  return `${trimmed.slice(0, 3)}...${trimmed.slice(-3)}`;
}
