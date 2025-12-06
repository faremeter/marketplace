import type { Kysely } from "kysely";
import { sql } from "kysely";
import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const ENCRYPTED_PREFIX = "enc:";

function getEncryptionKey(): Buffer {
  const key = process.env.WALLET_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("WALLET_ENCRYPTION_KEY environment variable is required");
  }
  return Buffer.from(key, "hex");
}

function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag();
  return `${ENCRYPTED_PREFIX}${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

function decrypt(encrypted: string): string {
  if (!encrypted.startsWith(ENCRYPTED_PREFIX)) return encrypted;
  const key = getEncryptionKey();
  const parts = encrypted.slice(ENCRYPTED_PREFIX.length).split(":");
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

function isEncrypted(value: string): boolean {
  return typeof value === "string" && value.startsWith(ENCRYPTED_PREFIX);
}

function transformKeys(
  obj: unknown,
  transform: (value: string) => string,
): unknown {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj))
    return obj.map((item) => transformKeys(item, transform));

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === "key" && typeof value === "string") {
      result[key] = transform(value);
    } else if (typeof value === "object" && value !== null) {
      result[key] = transformKeys(value, transform);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export async function up(db: Kysely<unknown>): Promise<void> {
  const tenants = await sql<{ id: number; wallet_config: unknown }>`
    SELECT id, wallet_config FROM tenants
  `.execute(db);

  for (const tenant of tenants.rows) {
    const config = tenant.wallet_config as Record<string, unknown>;
    const encrypted = transformKeys(config, (v) =>
      isEncrypted(v) ? v : encrypt(v),
    );

    await sql`
      UPDATE tenants SET wallet_config = ${JSON.stringify(encrypted)}::jsonb WHERE id = ${tenant.id}
    `.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  const tenants = await sql<{ id: number; wallet_config: unknown }>`
    SELECT id, wallet_config FROM tenants
  `.execute(db);

  for (const tenant of tenants.rows) {
    const config = tenant.wallet_config as Record<string, unknown>;
    const decrypted = transformKeys(config, (v) =>
      isEncrypted(v) ? decrypt(v) : v,
    );

    await sql`
      UPDATE tenants SET wallet_config = ${JSON.stringify(decrypted)}::jsonb WHERE id = ${tenant.id}
    `.execute(db);
  }
}
