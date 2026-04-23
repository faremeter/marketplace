import { Keypair } from "@solana/web3.js";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import bs58 from "bs58";

export interface WalletConfig {
  solana?: {
    "mainnet-beta": {
      address: string;
      key?: string;
    };
  };
  evm?: {
    base: { key?: string; address: string };
    polygon: { key?: string; address: string };
    monad: { key?: string; address: string };
  };
}

export interface EcosystemConfig {
  solana: { mode: "generate" | "import" | "skip"; key?: string };
  evm: { mode: "generate" | "import" | "skip"; key?: string };
}

export function generateSolanaWallet(): { address: string; key: string } {
  const keypair = Keypair.generate();
  return {
    address: keypair.publicKey.toBase58(),
    key: "[" + keypair.secretKey.toString() + "]",
  };
}

export function generateEvmWallet(): { address: string; key: string } {
  const privateKey = generatePrivateKey();
  return {
    key: privateKey,
    address: privateKeyToAccount(privateKey).address,
  };
}

export function deriveSolanaAddress(
  privateKey: string,
): { address: string; key: string } | null {
  try {
    let secretKey: Uint8Array;

    // Try parsing as JSON array first (e.g., "[1,2,3,...]")
    const trimmed = privateKey.trim();
    if (trimmed.startsWith("[")) {
      const parsed: unknown = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) {
        return null;
      }
      // Validate all values are valid bytes (0-255)
      for (const val of parsed) {
        if (
          typeof val !== "number" ||
          val < 0 ||
          val > 255 ||
          !Number.isInteger(val)
        ) {
          return null;
        }
      }
      secretKey = new Uint8Array(parsed);
    } else {
      // Try base58 decoding
      secretKey = bs58.decode(trimmed);
    }

    if (secretKey.length !== 64) {
      return null;
    }

    const keypair = Keypair.fromSecretKey(secretKey);
    return {
      address: keypair.publicKey.toBase58(),
      key: "[" + secretKey.toString() + "]",
    };
  } catch {
    return null;
  }
}

export function deriveEvmAddress(
  privateKey: string,
): { address: string; key: string } | null {
  try {
    let key = privateKey.trim();
    if (!key.startsWith("0x")) {
      key = "0x" + key;
    }

    // Validate hex format (0x + 64 hex chars)
    if (!/^0x[a-fA-F0-9]{64}$/.test(key)) {
      return null;
    }

    const account = privateKeyToAccount(key as `0x${string}`);
    return {
      key: key,
      address: account.address,
    };
  } catch {
    return null;
  }
}

export function buildWalletConfig(config: EcosystemConfig): WalletConfig {
  const result: WalletConfig = {};

  // Handle Solana
  if (config.solana.mode === "generate") {
    const wallet = generateSolanaWallet();
    result.solana = { "mainnet-beta": wallet };
  } else if (config.solana.mode === "import" && config.solana.key) {
    const wallet = deriveSolanaAddress(config.solana.key);
    if (wallet) {
      result.solana = { "mainnet-beta": wallet };
    }
  }

  // Handle EVM
  if (config.evm.mode === "generate") {
    const wallet = generateEvmWallet();
    result.evm = { base: wallet, polygon: wallet, monad: wallet };
  } else if (config.evm.mode === "import" && config.evm.key) {
    const wallet = deriveEvmAddress(config.evm.key);
    if (wallet) {
      result.evm = { base: wallet, polygon: wallet, monad: wallet };
    }
  }

  return result;
}

export function getWalletAddresses(config: WalletConfig) {
  return {
    solana: config.solana?.["mainnet-beta"]?.address ?? null,
    base: config.evm?.base?.address ?? null,
    polygon: config.evm?.polygon?.address ?? null,
    monad: config.evm?.monad?.address ?? null,
  };
}

export function isValidSolanaAddress(address: string): boolean {
  if (!address) return false;
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address.trim());
}

export function isValidEvmAddress(address: string): boolean {
  if (!address) return false;
  return /^0x[a-fA-F0-9]{40}$/.test(address.trim());
}

export function buildAddressOnlyConfig(addresses: {
  solana?: string;
  evm?: string;
}): WalletConfig {
  const result: WalletConfig = {};
  if (addresses.solana) {
    result.solana = { "mainnet-beta": { address: addresses.solana.trim() } };
  }
  if (addresses.evm) {
    const entry = { address: addresses.evm.trim() };
    result.evm = { base: entry, polygon: entry, monad: entry };
  }
  return result;
}

export function hasSolanaAddress(config: WalletConfig): boolean {
  return !!config?.solana?.["mainnet-beta"]?.address;
}

export function isWalletUsable(
  config: WalletConfig,
  fundingStatus: string,
): boolean {
  if (hasSolanaAddress(config)) {
    return fundingStatus === "funded";
  }
  return true;
}
