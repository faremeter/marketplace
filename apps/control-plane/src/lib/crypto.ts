import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const ENCRYPTED_PREFIX = "enc:";

function getEncryptionKey(): Buffer {
  const key = process.env.WALLET_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("WALLET_ENCRYPTION_KEY environment variable is required");
  }
  if (key.length !== 64) {
    throw new Error(
      "WALLET_ENCRYPTION_KEY must be 64 hex characters (32 bytes)",
    );
  }
  return Buffer.from(key, "hex");
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");

  const authTag = cipher.getAuthTag();

  return `${ENCRYPTED_PREFIX}${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

export function decrypt(encrypted: string): string {
  if (!isEncrypted(encrypted)) {
    return encrypted;
  }

  const key = getEncryptionKey();
  const parts = encrypted.slice(ENCRYPTED_PREFIX.length).split(":");

  if (parts.length !== 3) {
    throw new Error("Invalid encrypted format");
  }

  const [ivBase64, authTagBase64, ciphertext] = parts as [
    string,
    string,
    string,
  ];
  const iv = Buffer.from(ivBase64, "base64");
  const authTag = Buffer.from(authTagBase64, "base64");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "base64", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

export function isEncrypted(value: string): boolean {
  return typeof value === "string" && value.startsWith(ENCRYPTED_PREFIX);
}

export type WalletConfig = Record<string, unknown>;

export function encryptWalletKeys(config: WalletConfig): WalletConfig {
  return walkAndTransformKeys(config, (value) => {
    if (typeof value === "string" && !isEncrypted(value)) {
      return encrypt(value);
    }
    return value;
  });
}

export function decryptWalletKeys(config: WalletConfig): WalletConfig {
  return walkAndTransformKeys(config, (value) => {
    if (typeof value === "string" && isEncrypted(value)) {
      return decrypt(value);
    }
    return value;
  });
}

function walkAndTransformKeys(
  obj: unknown,
  transform: (value: string) => string,
): WalletConfig {
  if (obj === null || typeof obj !== "object") {
    return obj as WalletConfig;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) =>
      walkAndTransformKeys(item, transform),
    ) as unknown as WalletConfig;
  }

  const result: WalletConfig = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === "key" && typeof value === "string") {
      result[key] = transform(value);
    } else if (typeof value === "object" && value !== null) {
      result[key] = walkAndTransformKeys(value as WalletConfig, transform);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function validateEncryptionKey(): void {
  getEncryptionKey();
}
