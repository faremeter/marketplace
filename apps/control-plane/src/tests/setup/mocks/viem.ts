// Mock for viem (EVM client)

export const mockViemClient = {
  getBalance: async () => BigInt(1000000000000000000), // 1 ETH in wei
  readContract: async () => BigInt(100000000), // 100 USDC (6 decimals)
};

// Factory to create client with custom behavior
export function createMockViemClient(
  overrides: Partial<typeof mockViemClient> = {},
) {
  return { ...mockViemClient, ...overrides };
}

// Mock balance responses for different chains
export const mockChainBalances = {
  base: { native: "1.0", usdc: "100.00" },
  polygon: { native: "0.5", usdc: "50.00" },
  monad: { native: "0", usdc: "0" },
};
