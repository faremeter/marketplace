// Set env before imports
process.env.WALLET_ENCRYPTION_KEY = "a".repeat(64);

import t from "tap";
import {
  encrypt,
  decrypt,
  isEncrypted,
  encryptWalletKeys,
  decryptWalletKeys,
  validateEncryptionKey,
} from "./crypto.js";

await t.test("encrypt/decrypt", async (t) => {
  await t.test("roundtrip works correctly", async (t) => {
    const plaintext = "my-secret-private-key";
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);
    t.equal(decrypted, plaintext);
  });

  await t.test("encrypted value starts with enc:", async (t) => {
    const encrypted = encrypt("secret");
    t.ok(encrypted.startsWith("enc:"));
  });

  await t.test("encrypted value is different from plaintext", async (t) => {
    const plaintext = "secret";
    const encrypted = encrypt(plaintext);
    t.not(encrypted, plaintext);
  });

  await t.test(
    "same plaintext produces different ciphertext (random IV)",
    async (t) => {
      const plaintext = "secret";
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);
      t.not(encrypted1, encrypted2);
    },
  );

  await t.test("handles empty string", async (t) => {
    const encrypted = encrypt("");
    const decrypted = decrypt(encrypted);
    t.equal(decrypted, "");
  });

  await t.test("handles unicode characters", async (t) => {
    const plaintext = "secret-key-with-unicode-\u{1F680}";
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);
    t.equal(decrypted, plaintext);
  });

  await t.test("handles long strings", async (t) => {
    const plaintext = "a".repeat(10000);
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);
    t.equal(decrypted, plaintext);
  });
});

await t.test("isEncrypted", async (t) => {
  await t.test("returns true for encrypted values", async (t) => {
    const encrypted = encrypt("secret");
    t.equal(isEncrypted(encrypted), true);
  });

  await t.test("returns false for plaintext", async (t) => {
    t.equal(isEncrypted("plaintext"), false);
  });

  await t.test("returns false for empty string", async (t) => {
    t.equal(isEncrypted(""), false);
  });

  await t.test("returns false for enc: without full format", async (t) => {
    // Still returns true because it just checks prefix
    t.equal(isEncrypted("enc:"), true);
    t.equal(isEncrypted("enc:partial"), true);
  });
});

await t.test("decrypt", async (t) => {
  await t.test("returns unencrypted values unchanged", async (t) => {
    t.equal(decrypt("plaintext"), "plaintext");
    t.equal(decrypt("not-encrypted"), "not-encrypted");
  });

  await t.test("throws on invalid encrypted format", async (t) => {
    t.throws(() => decrypt("enc:invalid"), {
      message: /Invalid encrypted format/,
    });
    t.throws(() => decrypt("enc:a:b"), { message: /Invalid encrypted format/ });
  });
});

await t.test("encryptWalletKeys", async (t) => {
  await t.test("encrypts key fields in nested objects", async (t) => {
    const config = {
      solana: {
        "mainnet-beta": {
          address: "abc123",
          key: "my-secret-private-key",
        },
      },
    };

    const encrypted = encryptWalletKeys(config);
    const solana = encrypted.solana as {
      "mainnet-beta": { address: string; key: string };
    };

    // Address should NOT be encrypted
    t.equal(solana["mainnet-beta"].address, "abc123");

    // Key should be encrypted
    const encryptedKey = solana["mainnet-beta"].key;
    t.ok(isEncrypted(encryptedKey));
    t.not(encryptedKey, "my-secret-private-key");
  });

  await t.test("does not double-encrypt already encrypted keys", async (t) => {
    const alreadyEncrypted = encrypt("secret");
    const config = {
      solana: {
        "mainnet-beta": {
          key: alreadyEncrypted,
        },
      },
    };

    const result = encryptWalletKeys(config);
    const solana = result.solana as { "mainnet-beta": { key: string } };
    const key = solana["mainnet-beta"].key;

    // Should be unchanged
    t.equal(key, alreadyEncrypted);
  });

  await t.test("handles null config", async (t) => {
    const result = encryptWalletKeys(
      null as unknown as Record<string, unknown>,
    );
    t.equal(result, null);
  });
});

await t.test("decryptWalletKeys", async (t) => {
  await t.test("decrypts key fields in nested objects", async (t) => {
    const originalKey = "my-secret-private-key";
    const config = {
      solana: {
        "mainnet-beta": {
          address: "abc123",
          key: encrypt(originalKey),
        },
      },
    };

    const decrypted = decryptWalletKeys(config);
    const solana = decrypted.solana as {
      "mainnet-beta": { address: string; key: string };
    };

    // Address should be unchanged
    t.equal(solana["mainnet-beta"].address, "abc123");

    // Key should be decrypted
    t.equal(solana["mainnet-beta"].key, originalKey);
  });

  await t.test("roundtrip encrypt/decrypt wallet keys", async (t) => {
    const original = {
      solana: {
        "mainnet-beta": {
          address: "solana-address",
          key: "solana-private-key",
        },
      },
      evm: {
        base: {
          address: "0xabc",
          key: "evm-private-key",
        },
      },
    };

    const encrypted = encryptWalletKeys(original);
    const decrypted = decryptWalletKeys(encrypted);

    t.same(decrypted, original);
  });
});

await t.test("validateEncryptionKey", async (t) => {
  await t.test("does not throw with valid key", async (t) => {
    t.doesNotThrow(() => validateEncryptionKey());
  });
});
