import { Keypair } from "@solana/web3.js";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

export interface WalletConfig {
  solana: {
    "mainnet-beta": {
      address: string;
      key: string;
    };
  };
  evm: {
    base: { key: string; address: string };
    polygon: { key: string; address: string };
    monad: { key: string; address: string };
  };
}

export function generateWalletConfig(): WalletConfig {
  const evmPrivateKey = generatePrivateKey();
  const evmWallet = {
    key: evmPrivateKey,
    address: privateKeyToAccount(evmPrivateKey).address,
  };

  const mainnetBetaKeypair = Keypair.generate();

  return {
    solana: {
      "mainnet-beta": {
        address: mainnetBetaKeypair.publicKey.toBase58(),
        key: "[" + mainnetBetaKeypair.secretKey.toString() + "]",
      },
    },
    evm: {
      base: evmWallet,
      polygon: evmWallet,
      monad: evmWallet,
    },
  };
}

export function getWalletAddresses(config: WalletConfig) {
  return {
    solana: config.solana["mainnet-beta"].address,
    base: config.evm.base.address,
    polygon: config.evm.polygon.address,
    monad: config.evm.monad.address,
  };
}
