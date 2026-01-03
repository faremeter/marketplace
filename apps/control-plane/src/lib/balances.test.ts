import t from "tap";
import {
  extractAddresses,
  checkBalancesMeetMinimum,
  BALANCE_CACHE_TTL_MS,
  type WalletConfig,
  type WalletBalances,
} from "./balances.js";

await t.test("BALANCE_CACHE_TTL_MS", async (t) => {
  t.equal(BALANCE_CACHE_TTL_MS, 60 * 1000, "should be 1 minute");
});

await t.test("extractAddresses", async (t) => {
  await t.test("returns nulls for null config", async (t) => {
    const result = extractAddresses(null);
    t.same(result, { solana: null, evm: null });
  });

  await t.test("returns nulls for empty config", async (t) => {
    const result = extractAddresses({});
    t.same(result, { solana: null, evm: null });
  });

  await t.test("extracts solana address", async (t) => {
    const config: WalletConfig = {
      solana: {
        "mainnet-beta": {
          address: "sol-address-123",
          key: "enc:secret",
        },
      },
    };
    const result = extractAddresses(config);
    t.equal(result.solana, "sol-address-123");
    t.equal(result.evm, null);
  });

  await t.test("extracts evm address from base", async (t) => {
    const config: WalletConfig = {
      evm: {
        base: {
          address: "0xabc123",
          key: "enc:secret",
        },
      },
    };
    const result = extractAddresses(config);
    t.equal(result.solana, null);
    t.equal(result.evm, "0xabc123");
  });

  await t.test("extracts both addresses", async (t) => {
    const config: WalletConfig = {
      solana: {
        "mainnet-beta": {
          address: "sol-address",
        },
      },
      evm: {
        base: {
          address: "0xevm-address",
        },
      },
    };
    const result = extractAddresses(config);
    t.equal(result.solana, "sol-address");
    t.equal(result.evm, "0xevm-address");
  });

  await t.test("handles missing nested properties", async (t) => {
    const config: WalletConfig = {
      solana: {},
      evm: {},
    };
    const result = extractAddresses(config);
    t.same(result, { solana: null, evm: null });
  });
});

await t.test("checkBalancesMeetMinimum", async (t) => {
  await t.test("returns false for null balances", async (t) => {
    t.equal(checkBalancesMeetMinimum(null, 0.001, 0.01), false);
  });

  await t.test("returns true when solana meets minimum", async (t) => {
    const balances: WalletBalances = {
      solana: { native: "0.01", usdc: "1.00" },
      base: { native: "0", usdc: "0" },
      polygon: { native: "0", usdc: "0" },
      monad: { native: "0", usdc: "0" },
    };
    t.equal(checkBalancesMeetMinimum(balances, 0.001, 0.01), true);
  });

  await t.test("returns false when solana below minimum sol", async (t) => {
    const balances: WalletBalances = {
      solana: { native: "0.0001", usdc: "1.00" },
      base: { native: "0", usdc: "0" },
      polygon: { native: "0", usdc: "0" },
      monad: { native: "0", usdc: "0" },
    };
    t.equal(checkBalancesMeetMinimum(balances, 0.001, 0.01), false);
  });

  await t.test("returns false when solana below minimum usdc", async (t) => {
    const balances: WalletBalances = {
      solana: { native: "0.01", usdc: "0.001" },
      base: { native: "0", usdc: "0" },
      polygon: { native: "0", usdc: "0" },
      monad: { native: "0", usdc: "0" },
    };
    t.equal(checkBalancesMeetMinimum(balances, 0.001, 0.01), false);
  });

  await t.test("returns true when base chain meets minimum", async (t) => {
    const balances: WalletBalances = {
      solana: { native: "0", usdc: "0" },
      base: { native: "0.01", usdc: "1.00" },
      polygon: { native: "0", usdc: "0" },
      monad: { native: "0", usdc: "0" },
    };
    t.equal(checkBalancesMeetMinimum(balances, 0.001, 0.01), true);
  });

  await t.test("returns true when polygon chain meets minimum", async (t) => {
    const balances: WalletBalances = {
      solana: { native: "0", usdc: "0" },
      base: { native: "0", usdc: "0" },
      polygon: { native: "0.5", usdc: "50.00" },
      monad: { native: "0", usdc: "0" },
    };
    t.equal(checkBalancesMeetMinimum(balances, 0.001, 0.01), true);
  });

  await t.test("returns true when monad chain meets minimum", async (t) => {
    const balances: WalletBalances = {
      solana: { native: "0", usdc: "0" },
      base: { native: "0", usdc: "0" },
      polygon: { native: "0", usdc: "0" },
      monad: { native: "1.0", usdc: "100.00" },
    };
    t.equal(checkBalancesMeetMinimum(balances, 0.001, 0.01), true);
  });

  await t.test("returns false when evm has usdc but no native", async (t) => {
    const balances: WalletBalances = {
      solana: { native: "0", usdc: "0" },
      base: { native: "0", usdc: "100.00" },
      polygon: { native: "0", usdc: "0" },
      monad: { native: "0", usdc: "0" },
    };
    // EVM chains require native > 0 for gas
    t.equal(checkBalancesMeetMinimum(balances, 0.001, 0.01), false);
  });

  await t.test("returns false when all chains are empty", async (t) => {
    const balances: WalletBalances = {
      solana: { native: "0", usdc: "0" },
      base: { native: "0", usdc: "0" },
      polygon: { native: "0", usdc: "0" },
      monad: { native: "0", usdc: "0" },
    };
    t.equal(checkBalancesMeetMinimum(balances, 0.001, 0.01), false);
  });

  await t.test("handles empty string balances", async (t) => {
    const balances: WalletBalances = {
      solana: { native: "", usdc: "" },
      base: { native: "", usdc: "" },
      polygon: { native: "", usdc: "" },
      monad: { native: "", usdc: "" },
    };
    t.equal(checkBalancesMeetMinimum(balances, 0.001, 0.01), false);
  });
});
